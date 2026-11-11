import sys, numpy as np, cv2
from scipy.ndimage import median_filter, gaussian_filter1d
S=sys.argv[1]; W=S+'/work/'; O=S+'/out/'
img=cv2.imread(W+'cover.jpg'); H,Wd=img.shape[:2]
f=img.astype(np.float32)/255
d=np.load(W+'depth.npy').astype(np.float32)
seg=cv2.imread(W+'seg_raw.png',0).astype(np.float32)/255

# --- ridge line / ground mask
gy=np.diff(d,axis=0); gy[:1000]=0
ridge=np.argmax(gy,axis=0).astype(np.float32)
# ignore astronaut columns then interpolate
cols=np.arange(Wd); bad=(cols>820)&(cols<1180)
ridge[bad]=np.interp(cols[bad],cols[~bad],ridge[~bad])
ridge=median_filter(ridge,51); ridge=gaussian_filter1d(ridge,4)
yy=np.arange(H)[:,None]
ground=np.clip((yy-ridge[None,:])/3+0.5,0,1).astype(np.float32)
print('ridge',ridge[::250])

# --- astronaut mask via grabcut
x0,x1,y0,y1=760,1220,1080,1800
gc=np.full((H,Wd),cv2.GC_BGD,np.uint8)
k=np.ones((5,5),np.uint8)
pr=cv2.dilate((seg>0.05).astype(np.uint8),np.ones((41,41),np.uint8))
gc[pr>0]=cv2.GC_PR_BGD
gc[seg>0.5]=cv2.GC_PR_FGD
gc[cv2.erode((seg>0.9).astype(np.uint8),np.ones((25,25),np.uint8))>0]=cv2.GC_FGD
sub=gc[y0:y1,x0:x1].copy()
bg=np.zeros((1,65),np.float64); fg=np.zeros((1,65),np.float64)
cv2.grabCut(img[y0:y1,x0:x1],sub,None,bg,fg,6,cv2.GC_INIT_WITH_MASK)
am=np.zeros((H,Wd),np.float32); am[y0:y1,x0:x1]=((sub==1)|(sub==3)).astype(np.float32)
am=cv2.morphologyEx(am,cv2.MORPH_OPEN,k); am=cv2.morphologyEx(am,cv2.MORPH_CLOSE,np.ones((9,9),np.uint8))
# keep largest component
n,lab,st,_=cv2.connectedComponentsWithStats((am>0.5).astype(np.uint8))
am=(lab==1+np.argmax(st[1:,4])).astype(np.float32)
# extend straight down below the ridge a bit so the ground can slide over it
am_soft=cv2.GaussianBlur(am,(0,0),1.2)
cv2.imwrite(W+'astro_mask.png',(am_soft*255).astype(np.uint8))

# --- title mask (built in title step)
B,G,R=f[...,0],f[...,1],f[...,2]
tb=(cv2.imread(W+'tb2.png',0)>0).astype(np.uint8)
tb=cv2.morphologyEx(cv2.erode(tb,np.ones((5,5),np.uint8)),cv2.MORPH_OPEN,np.ones((9,9),np.uint8))
tb=cv2.dilate(tb,np.ones((3,3),np.uint8))
shape=cv2.GaussianBlur(tb.astype(np.float32),(0,0),1.5)      # clean letter shapes
cv2.imwrite(W+'title_mask.png',(shape*255).astype(np.uint8))

# --- remove the title from the rock (local colour transfer)
def lmean(x,m,s=40):
    return cv2.GaussianBlur(x*m[...,None],(0,0),s)/(cv2.GaussianBlur(m,(0,0),s)[...,None]+1e-4)
inside=(tb>0).astype(np.float32); near=cv2.dilate(tb,np.ones((121,121),np.uint8)).astype(np.float32)*(1-cv2.dilate(tb,np.ones((9,9),np.uint8)))
mu_t=lmean(f,inside); mu_r=lmean(f,near,60)
sd_t=np.sqrt(np.maximum(lmean((f-mu_t)**2,inside),1e-5)); sd_r=np.sqrt(np.maximum(lmean((f-mu_r)**2,near,60),1e-5))
fixed=(f-mu_t)*np.clip(sd_r/sd_t,0.5,1.2)+mu_r
sh3=cv2.GaussianBlur(cv2.dilate(tb,np.ones((5,5),np.uint8)).astype(np.float32),(0,0),2)[...,None]
clean=f*(1-sh3)+np.clip(fixed,0,1)*sh3
# the letters' outlines survive the colour transfer: paint over a thin ring along them
ring=(cv2.dilate(tb,np.ones((11,11),np.uint8))-cv2.erode(tb,np.ones((9,9),np.uint8)))[:400]
top=cv2.inpaint((clean[:400]*255).astype(np.uint8),ring,5,cv2.INPAINT_TELEA).astype(np.float32)/255
rs=cv2.GaussianBlur(ring.astype(np.float32),(0,0),1.5)[...,None]
rng0=np.random.default_rng(2); top=np.clip(top+rng0.normal(0,0.018,top.shape[:2]+(1,)),0,1)
clean[:400]=clean[:400]*(1-rs)+top*rs

# --- wall layer: no title, no astronaut, extended below the ridge
hole=cv2.dilate((am>0.5).astype(np.uint8),np.ones((21,21),np.uint8))
c8=(clean*255).astype(np.uint8)
# below the ridge: mirror the wall just above it
rr=ridge[None,:]-6; src=np.clip(2*rr-yy,0,H-1).astype(np.float32); mapx=np.repeat(cols[None,:].astype(np.float32),H,0)
mir=cv2.remap(c8,mapx,src,cv2.INTER_LINEAR)
below=np.clip((yy-rr)/4,0,1)[...,None]
c8=(c8*(1-below)+mir*below).astype(np.uint8)
hole_m=cv2.remap(hole,mapx,src,cv2.INTER_NEAREST); hole=np.where(yy>rr,hole_m,hole).astype(np.uint8)
small=cv2.resize(c8,(1000,1000),interpolation=cv2.INTER_AREA)
hm=cv2.resize(hole,(1000,1000),interpolation=cv2.INTER_NEAREST)
inp=cv2.inpaint(small,hm,5,cv2.INPAINT_TELEA)
inp=cv2.resize(inp,(Wd,H),interpolation=cv2.INTER_CUBIC)
# grain back on the filled patch
rng=np.random.default_rng(1); inp=np.clip(inp+rng.normal(0,5,(H,Wd,1)),0,255)
hm2=cv2.GaussianBlur(cv2.resize(hm,(Wd,H)).astype(np.float32),(0,0),3)[...,None]
wall=(c8*(1-hm2)+inp*hm2).astype(np.uint8)
# below the band: darken to nothing (never seen)
cv2.imwrite(O+'wall.webp',wall,[cv2.IMWRITE_WEBP_QUALITY,84])

def rgba(rgb,alpha,name,box=None):
    out=np.dstack([rgb,(np.clip(alpha,0,1)*255).astype(np.uint8)])
    if box: out=out[box[2]:box[3],box[0]:box[1]]
    cv2.imwrite(O+name,out,[cv2.IMWRITE_WEBP_QUALITY,88])
rgba(img,ground*(1-0*am_soft),'ground.webp')
# astronaut: alpha = mask, cut where the ground is in front
ab=(760,1220,1080,1800); rgba(img,am_soft,'astro.webp',ab)
tbx=(80,1940,50,340); rgba(img,shape,'title.webp',tbx)

# --- depth maps (8 bit, 1024)
def save_d(x,name):
    x=cv2.GaussianBlur(x,(0,0),6); cv2.imwrite(O+name,(np.clip(cv2.resize(x,(512,512),interpolation=cv2.INTER_AREA),0,1)*255).astype(np.uint8))
# wall depth: fill ground+astronaut by inpainting the depth
d8=(np.clip(d/0.5,0,1)*255).astype(np.uint8)       # walls live in 0..0.5
fillm=((ground>0.01)|(cv2.dilate((am>0.5).astype(np.uint8),np.ones((31,31),np.uint8))>0)).astype(np.uint8)
s=cv2.resize(d8,(500,500),interpolation=cv2.INTER_AREA); fm=cv2.resize(fillm,(500,500),interpolation=cv2.INTER_NEAREST)
wd=cv2.inpaint(s,cv2.dilate(fm,np.ones((5,5),np.uint8)),5,cv2.INPAINT_TELEA)
wd=cv2.resize(wd,(Wd,H),interpolation=cv2.INTER_CUBIC).astype(np.float32)/255
save_d(wd,'wall_d.png')
# ground depth: extend ridge value upward
gd=d.copy(); ri=np.clip(ridge.astype(int)+6,0,H-1); rv=d[ri,cols]
gd=np.where(yy<ri[None,:],rv[None,:],gd)
save_d(gd,'ground_d.png')
ad=float(np.median(d[am>0.5])); print('astro depth',ad,'ridge depth @1000',rv[1000], 'wall d max',wd.max()*0.5)
import json; json.dump({'astroBox':ab,'titleBox':tbx,'astroDepth':ad,'ridge':[float(v) for v in ridge[::50]]},open(O+'meta.json','w'))
# previews
pv=np.hstack([cv2.resize(wall,(700,700)),cv2.resize((img*am_soft[...,None]).astype(np.uint8),(700,700)),cv2.resize((img*ground[...,None]).astype(np.uint8),(700,700))])
cv2.imwrite(W+'pv_layers.png',pv)
cv2.imwrite(W+'pv_title.png',np.vstack([wall[0:400],(img[0:400]*shape[0:400,:,None]).astype(np.uint8)]))
cv2.imwrite(W+'pv_astro.png',np.hstack([img[1080:1800,760:1220],(img*am_soft[...,None]).astype(np.uint8)[1080:1800,760:1220],wall[1080:1800,760:1220]]))
