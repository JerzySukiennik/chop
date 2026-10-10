import sys, subprocess, numpy as np, json, os
from scipy.io import wavfile
RAW='sound-raw'; OUT='../sounds'; os.makedirs(OUT,exist_ok=True)
plan={'fs_634119':'carrot','fs_201033':'carrot','fs_87984':'carrot','fs_163275':'cucumber','fs_625624':'cucumber','fs_627197':'apple'}
report={}
for key,cat in plan.items():
    wav=f'/tmp/{key}.wav'
    subprocess.run(['ffmpeg','-y','-loglevel','error','-i',f'{RAW}/{key}.mp3','-ac','1','-ar','44100',wav],check=True)
    sr,x=wavfile.read(wav); x=x.astype(np.float32)/32768
    hop=256; n=len(x)//hop
    env=np.sqrt(np.array([np.mean(x[i*hop:(i+1)*hop]**2) for i in range(n)])+1e-12)
    flux=np.maximum(0,np.diff(env,prepend=env[0]))
    thr=np.percentile(flux,99.0)
    cands=[i for i in range(1,n-1) if flux[i]>thr and flux[i]>=flux[i-1] and flux[i]>=flux[i+1]]
    picks=[];
    for i in sorted(cands,key=lambda i:-flux[i]):
        if all(abs(i-j)*hop/sr>0.3 for j in picks): picks.append(i)
    picks=picks[:6]; out=[]
    for k,i in enumerate(sorted(picks)):
        s=max(0,i*hop-int(0.012*sr)); e=min(len(x),s+int(0.42*sr))
        seg=x[s:e].copy(); L=len(seg)
        fi=int(0.004*sr); seg[:fi]*=np.linspace(0,1,fi)
        fo=int(0.15*sr); seg[-fo:]*=np.linspace(1,0,fo)**2
        seg/=max(1e-6,np.max(np.abs(seg)))/0.9
        name=f'{cat}_{key[3:]}_{k}'
        tmp=f'/tmp/{name}.wav'; wavfile.write(tmp,sr,(seg*32767).astype(np.int16))
        subprocess.run(['ffmpeg','-y','-loglevel','error','-i',tmp,'-b:a','128k',f'{OUT}/{name}.mp3'],check=True)
        out.append({'file':name+'.mp3','t':round(i*hop/sr,2),'flux':float(flux[i])})
    report[key]=out
json.dump(report,open('sound-slices.json','w'),indent=1)
for k,v in report.items(): print(k,[(o['file'],o['t']) for o in v])
