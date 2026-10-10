# Green lamp regression

`negative-green-reference.png` is a lossless 33 × 33 crop at `(367, 728)` of
the user's 914 × 1060 annotated screenshot supplied on 2026-09-08. The green
lamp itself is unobscured; the crop includes the neutral ROI border, but
excludes the red user markup and the result label. The original camera photo
was not available in this session. This fixture verifies lamp classification,
not body localization or barcode decoding from the original photo.

Before the fix, only 15 pixels passed the green threshold, below the required
27 pixels, despite a visible bright green patch. Tests cover the crop with
resizing, JPEG compression and reduced exposure, alongside synthetic glare
and noise negatives. Full-photo regressions remain `test-img/a-1.jpg` and
`test-img/a-2.jpg`.

## Result-lamp spill regression

`spill-negative.png` (16 × 18, origin 276,887) and `spill-positive.png`
(14 × 17, origin 305,888) are lossless crops of the lamp interiors in the
user's 646 × 1316 annotated screenshot supplied on 2026-09-08. They exclude
the red ROI outlines and labels. The independent classifier reports both ON:
Negative has 10 qualifying pixels, Positive has 213. Mutual-exclusion
comparison must retain Positive and suppress Negative spill. These tiny
reference crops validate classification only, not full camera-photo accuracy.
The original new camera photo was unavailable; a separate test strengthens
the Negative reflection in the full a-2 frame and checks automatic and manual
body analysis paths.
