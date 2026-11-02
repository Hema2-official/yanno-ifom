"""
The tracking models the run dialog offers (trackingModels in src/lib/compute/models.ts) beyond
symmetry-tracker-web's track.onnx, exported to ONNX like that one. Each MODEL is one
IFOMYeast_KernelTracker_[DLV3p,<backbone>]_FBtr<n>_LargeDatsetAugm_Adv2.pth from the tracker's download
server. It becomes OUT/track_<backbone>_FBtr<n>.onnx: input "input" (1, 2n + 2, H, W), the 2n + 1 frames of
the time kernel and the marker channel, H and W multiples of 16; output "logits" (1, 2n + 1, H, W). OUT's
manifest.json gets each file's size and SHA-256, and the model it came from.

Run it in the tracker workspace's Python environment (torch 1.10, segmentation-models-pytorch). Loading a
.pth runs what it pickled, so use only the download server's files.

  python export_trackers.py OUT MODEL...
"""
import argparse
import hashlib
import json
import os
import re

import torch

NAME = re.compile(r"IFOMYeast_KernelTracker_\[DLV3p,(\w+)\]_FBtr(\d+)_LargeDatsetAugm_Adv2\.pth$")


class BlankChannel(torch.nn.Module):
  """
  ONNX Runtime's WebGPU Conv silently goes wrong on a first convolution of 6 or 18 input channels (on 4, 8, 10,
  12, 14, 16 and 20 it's right; on the CPU, all of them). One more channel, blank and weighted zero, avoids that
  and leaves the output as it was.
  """
  def __init__(self, model):
    super().__init__()
    conv = model.encoder.conv1
    wider = torch.nn.Conv2d(conv.in_channels + 1, conv.out_channels, conv.kernel_size, conv.stride, conv.padding,
                            bias=False)
    wider.weight.data = torch.cat([conv.weight.data, torch.zeros_like(conv.weight.data[:, :1])], dim=1)
    model.encoder.conv1 = wider
    self.model = model

  def forward(self, frames):
    return self.model(torch.nn.functional.pad(frames, (0, 0, 0, 0, 0, 1)))


def sha256(path):
  digest = hashlib.sha256()
  with open(path, "rb") as f:
    for block in iter(lambda: f.read(1 << 20), b""):
      digest.update(block)
  return digest.hexdigest()


def main():
  ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
  ap.add_argument("out")
  ap.add_argument("models", nargs="+")
  args = ap.parse_args()
  manifest_path = os.path.join(args.out, "manifest.json")
  with open(manifest_path) as f:
    manifest = json.load(f)
  for model_path in args.models:
    source = os.path.basename(model_path)
    backbone, time_kernel_size = NAME.search(source).groups()
    name = f"track_{backbone}_FBtr{time_kernel_size}.onnx"
    path = os.path.join(args.out, name)
    model = torch.load(model_path, map_location=torch.device("cpu")).eval()
    channels = 2 * int(time_kernel_size) + 2
    if channels % 3 == 0 and channels % 4 != 0:
      model = BlankChannel(model).eval()
    example = torch.zeros(1, channels, 512, 512)
    with torch.no_grad():
      torch.onnx.export(model, example, path, opset_version=13, input_names=["input"], output_names=["logits"],
                        dynamic_axes={"input": {2: "height", 3: "width"}, "logits": {2: "height", 3: "width"}},
                        do_constant_folding=True)
    manifest["models"][name] = {"bytes": os.path.getsize(path), "sha256": sha256(path), "inputs": ["input"],
                                "outputs": ["logits"], "source": source, "source_sha256": sha256(model_path)}
    print(f"{name}: {os.path.getsize(path) / 1e6:.1f} MB", flush=True)
    with open(manifest_path, "w") as f:
      json.dump(manifest, f, indent=1)


if __name__ == "__main__":
  main()
