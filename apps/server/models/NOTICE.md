# nudenet-320n.onnx

The image check's model: NudeNet 320n detector (notAI-tech/NudeNet), ONNX export as published in the `nudenet` Python package.
License: **AGPL-3.0** (the code and the weights). Accepted by Afik on 20.10.2026 for now, to be reviewed before a commercial launch
(replace the model, or train one of our own on the training set) — decisions-in-force.md §2.
Loaded only by the background job (apps/server/src/jobs/nudenet.ts); the request server never loads it.
