"""Validated public-report payout parsers, shared with the original calendar collector."""
import re,math

def parse_place_quotes(block):
    quotes={};active=False
    for line in block.splitlines():
        if '마번' in line and '단승식' in line and '연승식' in line:
            active=True;continue
        if not active:continue
        if line.lstrip().startswith('(') or '배당률 단:' in line:break
        cells=line.split()
        if len(cells)<4 or not cells[1].isdigit():continue
        if not (cells[0].isdigit() or cells[0] in ('중지','실격')):continue
        try:number=int(cells[1]);odds=float(cells[-1])
        except ValueError:continue
        if not 1<=number<=20 or not math.isfinite(odds) or odds<1:continue
        if number in quotes:raise ValueError('Duplicate horse in report odds')
        quotes[number]=dict(numbers=[number],odds=odds)
    return list(quotes.values())

def dividends(block,kind,expected):
    circles={chr(0x2460+i):i+1 for i in range(20)}
    heading=re.search(r'배당률\s+단:',block)
    if not heading:raise ValueError('Missing dividend heading')
    tail=block[heading.end():]
    match=re.search(r'\s연:\s*(.*?)\s+복:',tail,re.S) if kind=='place' else re.search(r'복연:\s*([^\r\n]+)',tail)
    if not match:raise ValueError('Missing '+kind+' dividends')
    value=match[1].strip();pattern=r'([①-⑳])\s*(\d+(?:\.\d+)?)' if kind=='place' else r'([①-⑳])\s*([①-⑳])\s*(\d+(?:\.\d+)?)'
    result=[];seen=set()
    for parts in re.findall(pattern,value):
        ns=sorted(circles[c] for c in parts[:-1]);odds=float(parts[-1]);key=tuple(ns)
        if odds<1 or len(set(ns))!=len(ns) or key in seen:raise ValueError('Invalid payout')
        seen.add(key);result.append(dict(numbers=ns,odds=odds))
    if re.sub(pattern,'',value).strip() or seen!=set(expected):raise ValueError('Dividend winners mismatch')
    return dict(status='confirmed',payouts=result)
