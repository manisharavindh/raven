import torch
import cv2
import numpy as np

# Load model
model = torch.hub.load('hustvl/yolopv2', 'yolopv2', pretrained=True, trust_repo=True)
model.eval()

# Dummy image 640x640
img = torch.randn(1, 3, 640, 640)
with torch.no_grad():
    out = model(img)

print("Output type:", type(out))
if isinstance(out, list) or isinstance(out, tuple):
    print("Num outputs:", len(out))
    for i, o in enumerate(out):
        if isinstance(o, torch.Tensor):
            print(f"Output {i} shape: {o.shape}")
        elif isinstance(o, list):
            print(f"Output {i} is a list of len {len(o)}, first element shape: {o[0].shape}")
        else:
            print(f"Output {i} type: {type(o)}")
