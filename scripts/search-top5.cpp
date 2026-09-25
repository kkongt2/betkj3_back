// Deterministic candidate search. Finalists are re-evaluated by the site's JS engine.
#include <algorithm>
#include <array>
#include <cmath>
#include <fstream>
#include <iostream>
#include <numeric>
#include <random>
#include <set>
#include <vector>
#include <omp.h>
using W=std::array<int,21>;
struct Race{int date,n,k;int number[20];double legacy[20],prob[20],f[20][21],q[20][20],paid[20][20];};
struct Result{W w;int mode,lo,hi,n,hits;double paid;double value()const{return n?paid/n:0;}};
std::vector<Race> races;
int familyMode,baseMin,baseMax;
std::vector<Result> evaluate(W w,bool existing=false){
 double paid[2][21][21]={};int count[2][21][21]={},hits[2][21][21]={};
 for(const auto&r:races){
  double score[20];int rank[20],active=0;double sum=std::accumulate(w.begin(),w.end(),0.0),mean=0;
  for(int i=0;i<r.n;i++){rank[active++]=i;score[i]=0;for(int j=0;j<21;j++)score[i]+=r.f[i][j]*w[j]/sum;score[i]*=6.28;mean+=score[i];}
  mean/=r.n;for(int i=0;i<r.n;i++)score[i]=existing?r.prob[i]:std::exp(std::max(-4.0,std::min(4.0,(score[i]-mean)*.6)));
  auto better=[&](int a,int b){return b<0||score[a]>score[b]||(score[a]==score[b]&&r.number[a]<r.number[b]);};
  std::sort(rank,rank+active,[&](int a,int b){return better(a,b);});
  int analysis=rank[0];
  for(int mode=familyMode;mode<=familyMode;mode++){
   int anchor=analysis;
   for(int lo=std::max(2,baseMin-3);lo<=std::min(active,baseMin+3);lo++){int partner=-1;
    for(int hi=lo;hi<=20;hi++){
     if(hi<=active){int c=rank[hi-1];if(c!=anchor&&(partner<0||(existing?(r.q[anchor][c]>r.q[anchor][partner]||(r.q[anchor][c]==r.q[anchor][partner]&&better(c,partner))):better(c,partner))))partner=c;}
     if(partner>=0&&std::abs(hi-baseMax)<=3){count[mode][lo][hi]++;paid[mode][lo][hi]+=r.paid[anchor][partner];hits[mode][lo][hi]+=r.paid[anchor][partner]>0;}
    }
   }
  }
 }
 std::vector<Result> out;for(int m=0;m<2;m++)for(int l=2;l<=20;l++)for(int h=l;h<=20;h++)if(count[m][l][h])out.push_back({w,m,l,h,count[m][l][h],hits[m][l][h],paid[m][l][h]});return out;
}
int main(int argc,char**argv){
 std::ifstream in(argv[1]);int n,totalRaces;in>>n>>totalRaces;races.resize(n);for(auto&r:races){in>>r.date>>r.n>>r.k;for(int i=0;i<r.n;i++){in>>r.number[i]>>r.legacy[i]>>r.prob[i];for(double&x:r.f[i])in>>x;}for(int i=0;i<r.n;i++)for(int j=0;j<r.n;j++)in>>r.q[i][j]>>r.paid[i][j];}if(!in)return 2;


 const int minimumEvaluated=int(std::ceil(totalRaces*.4));
 std::ifstream seed(argv[3]);W origin;seed>>familyMode>>baseMin>>baseMax;for(int&i:origin)seed>>i;
 int minWeight,maxWeight,ng;seed>>minWeight>>maxWeight>>ng;
 struct Group{int min,max;std::vector<int> ids;};std::vector<Group> groups(ng);int member[21];
 for(int gi=0;gi<ng;gi++){auto&g=groups[gi];int n;seed>>g.min>>g.max>>n;g.ids.resize(n);for(int&i:g.ids){seed>>i;member[i]=gi;}}if(!seed)return 3;
 auto groupSum=[&](const W&w,int gi){int sum=0;for(int i:groups[gi].ids)sum+=w[i];return sum;};
 auto distance=[](const W&a,const W&b){int n=0;for(int i=0;i<21;i++)n+=std::abs(a[i]-b[i]);return n;};
 auto valid=[&](const W&w){if(std::accumulate(w.begin(),w.end(),0)!=100)return false;for(int i=0;i<21;i++)if(w[i]<(i<17?minWeight:0)||w[i]>maxWeight)return false;for(int gi=0;gi<ng;gi++){int sum=groupSum(w,gi);if(sum<groups[gi].min||sum>groups[gi].max)return false;}return true;};
 std::mt19937 rng(20260916+baseMax*17+familyMode);std::set<W> seen;std::vector<Result> board;int tested=0;
 auto batch=[&](const std::vector<W>& ws){std::vector<W> pending;for(const auto&w:ws)if(valid(w)&&seen.insert(w).second)pending.push_back(w);tested+=pending.size();std::vector<std::vector<Result>> scores(pending.size());
 #pragma omp parallel for schedule(dynamic,1) num_threads(2)
 for(int i=0;i<int(pending.size());i++)scores[i]=evaluate(pending[i]);
 for(auto&set:scores){for(auto&r:set)if(r.n>=minimumEvaluated&&r.hits*20>=r.n*3)board.push_back(r);}
 std::sort(board.begin(),board.end(),[](const Result&a,const Result&b){if(a.value()!=b.value())return a.value()>b.value();if(a.n!=b.n)return a.n>b.n;if(a.w!=b.w)return a.w<b.w;if(a.lo!=b.lo)return a.lo<b.lo;return a.hi<b.hi;});
 std::vector<Result> keep;for(const auto&r:board)if(std::all_of(keep.begin(),keep.end(),[&](const Result&x){return distance(x.w,r.w)>=6;})){keep.push_back(r);if(keep.size()==36)break;}board.swap(keep);
 std::cerr<<"Family "<<familyMode<<":"<<baseMin<<"-"<<baseMax<<" tested "<<tested<<" weight candidates, retained "<<board.size()<<std::endl;
 };
 std::vector<W> initial={origin};
 for(int a=0;a<21;a++)for(int b=0;b<21;b++)for(int shift:{1,3,5,10,15})if(a!=b&&origin[a]-shift>=(a<17?minWeight:0)){W w=origin;w[a]-=shift;w[b]+=shift;initial.push_back(w);}
 for(int trial=0;trial<1000;trial++){
  W w;for(int i=0;i<21;i++)w[i]=i<17?minWeight:0;double priority[21];for(double&v:priority){double u=1+(rng()%1000);v=u*u;}
  auto add=[&](const std::vector<int>& ids){int best=-1;double val=-1;for(int i:ids)if(w[i]<maxWeight&&groupSum(w,member[i])<groups[member[i]].max){double p=priority[i]/(w[i]-(i<17?minWeight:0)+1);if(p>val){val=p;best=i;}}if(best<0)return false;w[best]++;return true;};
  for(int gi=0;gi<ng;gi++)while(groupSum(w,gi)<groups[gi].min)if(!add(groups[gi].ids))return 5;
  std::vector<int> ids(21);std::iota(ids.begin(),ids.end(),0);while(std::accumulate(w.begin(),w.end(),0)<100)if(!add(ids))return 5;
  initial.push_back(w);
 }
 batch(initial);if(board.empty())return 4;
 for(int round=0;round<2;round++)for(int step:{3,1}){std::vector<W> next;auto top=board;for(int t=0;t<std::min(8,int(top.size()));t++)for(int a=0;a<21;a++)for(int b=0;b<21;b++)if(a!=b&&top[t].w[a]-step>=(a<17?minWeight:0)){W w=top[t].w;w[a]-=step;w[b]+=step;next.push_back(w);}batch(next);}
 std::ofstream out(argv[2]);out<<"{\"weightCandidates\":"<<tested<<",\"finalists\":[";bool first=true;for(const auto&r:board){if(!first)out<<',';first=false;out<<"{\"weights\":[";for(int i=0;i<21;i++){if(i)out<<',';out<<r.w[i];}out<<"]}";}out<<"]}";
}
