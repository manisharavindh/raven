import torch
print("Loading YOLOPv2...")
try:
    model = torch.hub.load('hustvl/yolopv2', 'yolopv2', pretrained=True)
    print("Success")
except Exception as e:
    print("Error:", e)
