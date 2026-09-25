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
std::vector<Result> evaluate(W w,bool existing=false){
 double paid[2][21][21]={};int count[2][21][21]={},hits[2][21][21]={};
 for(const auto&r:races){
  double score[20];int rank[20],active=0;double sum=std::accumulate(w.begin(),w.end(),0.0),mean=0;
  for(int i=0;i<r.n;i++){rank[active++]=i;score[i]=0;for(int j=0;j<21;j++)score[i]+=r.f[i][j]*w[j]/sum;score[i]*=6.28;mean+=score[i];}
  mean/=r.n;for(int i=0;i<r.n;i++)score[i]=existing?r.prob[i]:std::exp(std::max(-4.0,std::min(4.0,(score[i]-mean)*.6)));
  auto better=[&](int a,int b){return b<0||score[a]>score[b]||(score[a]==score[b]&&r.number[a]<r.number[b]);};
  std::sort(rank,rank+active,[&](int a,int b){return better(a,b);});
  int analysis=rank[0];
  for(int mode=0;mode<2;mode++){
   int anchor=analysis;
   for(int lo=2;lo<=active;lo++){int partner=-1;
    for(int hi=lo;hi<=20;hi++){
     if(hi<=active){int c=rank[hi-1];if(c!=anchor&&(partner<0||(existing?(r.q[anchor][c]>r.q[anchor][partner]||(r.q[anchor][c]==r.q[anchor][partner]&&better(c,partner))):better(c,partner))))partner=c;}
     if(partner>=0){count[mode][lo][hi]++;paid[mode][lo][hi]+=r.paid[anchor][partner];hits[mode][lo][hi]+=r.paid[anchor][partner]>0;}
    }
   }
  }
 }
 std::vector<Result> out;for(int m=0;m<2;m++)for(int l=2;l<=20;l++)for(int h=l;h<=20;h++)if(count[m][l][h])out.push_back({w,m,l,h,count[m][l][h],hits[m][l][h],paid[m][l][h]});return out;
}
int main(int argc,char**argv){
 std::ifstream in(argv[1]);int n,totalRaces;in>>n>>totalRaces;races.resize(n);for(auto&r:races){in>>r.date>>r.n>>r.k;for(int i=0;i<r.n;i++){in>>r.number[i]>>r.legacy[i]>>r.prob[i];for(double&x:r.f[i])in>>x;}for(int i=0;i<r.n;i++)for(int j=0;j<r.n;j++)in>>r.q[i][j]>>r.paid[i][j];}if(!in)return 2;

 const int minimumEvaluated=int(std::ceil(totalRaces*.4));
 int style=std::stoi(argv[3]),maxLo=std::stoi(argv[4]);std::mt19937 rng(20260915);std::set<W> seen;std::vector<Result> board;int tested=0;
 auto allowed=[&](int j){return j!=10&&j!=13&&j!=14&&j!=15||style==4||(style==3&&(j==10||j==15))||(style<3&&j==(style==0?10:style==1?13:14));};
 std::vector<int> ids;for(int i=0;i<21;i++)if(allowed(i))ids.push_back(i);
 auto batch=[&](std::vector<W> ws){for(auto w:ws){if(!seen.insert(w).second)continue;tested++;auto scores=evaluate(w);for(auto&r:scores)if(r.n>=minimumEvaluated&&r.lo<=maxLo&&r.hi>r.lo)board.push_back(r);
 std::sort(board.begin(),board.end(),[](const Result&a,const Result&b){if(a.value()!=b.value())return a.value()>b.value();if(a.n!=b.n)return a.n>b.n;if(a.w!=b.w)return a.w<b.w;if(a.mode!=b.mode)return a.mode<b.mode;if(a.lo!=b.lo)return a.lo<b.lo;return a.hi<b.hi;});
 std::set<W> keep;board.erase(std::remove_if(board.begin(),board.end(),[&](auto&r){return !keep.insert(r.w).second;}),board.end());if(board.size()>2)board.resize(2);}};
 std::vector<W> initial;for(int i:ids){W w={};w[i]=100;initial.push_back(w);}
 for(int t=0;t<100;t++){W w={};double a[21]={},total=0;for(int i:ids){a[i]=std::pow(-std::log((rng()+1.0)/(rng.max()+2.0)),t%3+1);total+=a[i];}int used=0;for(int i:ids){w[i]=int(a[i]*100/total);used+=w[i];}while(used++<100)w[ids[rng()%ids.size()]]++;initial.push_back(w);}
 batch(initial);if(board.empty())return 4;
 for(int step:{5,1}){std::vector<W> next;for(int t=0;t<48;t++){W w=board[0].w;int a=ids[rng()%ids.size()],b=ids[rng()%ids.size()];if(a!=b&&w[a]>=step){w[a]-=step;w[b]+=step;next.push_back(w);}}batch(next);}
 std::ofstream out(argv[2]);out<<"{\"weightCandidates\":"<<tested<<",\"finalists\":[";bool first=true;for(const auto&r:board){if(!first)out<<',';first=false;out<<"{\"weights\":[";for(int i=0;i<21;i++){if(i)out<<',';out<<r.w[i];}out<<"]}";}out<<"]}";
}
