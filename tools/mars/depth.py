import sys, numpy as np, cv2, onnxruntime as ort
S=sys.argv[1]
img=cv2.imread(S+'/work/cover.jpg'); H,W=img.shape[:2]; print(H,W)
rgb=cv2.cvtColor(img,cv2.COLOR_BGR2RGB).astype(np.float32)/255
# depth
s=ort.InferenceSession(S+'/models/da.onnx'); i=s.get_inputs()[0]; print(i.name,i.shape)
N=518
x=cv2.resize(rgb,(N,N),interpolation=cv2.INTER_CUBIC)
x=(x-[0.485,0.456,0.406])/[0.229,0.224,0.225]
d=s.run(None,{i.name:x.transpose(2,0,1)[None].astype(np.float32)})[0].squeeze()
d=(d-d.min())/(d.max()-d.min())
d=cv2.resize(d,(W,H),interpolation=cv2.INTER_CUBIC)
np.save(S+'/work/depth.npy',d); cv2.imwrite(S+'/work/depth_raw.png',(d*255).astype(np.uint8))
# seg
s=ort.InferenceSession(S+'/models/u2net.onnx'); i=s.get_inputs()[0]
x=cv2.resize(rgb,(320,320)); x=(x-[0.485,0.456,0.406])/[0.229,0.224,0.225]
m=s.run(None,{i.name:x.transpose(2,0,1)[None].astype(np.float32)})[0].squeeze()
m=(m-m.min())/(m.max()-m.min()); m=cv2.resize(m,(W,H),interpolation=cv2.INTER_CUBIC)
cv2.imwrite(S+'/work/seg_raw.png',(m*255).astype(np.uint8))
