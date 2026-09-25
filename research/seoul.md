# Seoul-only strategy

All public race cards, calendars, market quotes, compact historical shards, feature histories, scalers, candidate searches, validation folds and denominators include Seoul only. The 40% eligibility requirement uses all Seoul source races, including excluded/unsettled races, in each relevant period. Historical per-quarter field-size buffers remain calculated from earlier Seoul races only.

Sixteen integer-weighted features are recalculated from prior Seoul race days. Scaling uses Seoul feature observations through 2023-09-30. Each quarter uses a 24/36-month window and its final three months for selection; five record variants and both anchors/rank ranges are compared before the following quarter is assessed. Old nationwide learned models and reports are retired. Search is bounded and is not a proof of a global optimum; previously studied archives are not untouched future data.

Saved regional settings import only their Seoul weights (falling back to the saved common vector). Ten/thirteen-entry vectors are padded with zero. Every imported setting now uses the Seoul sixteen-feature model, so old numerical results are not preserved. Non-Seoul locally recorded predictions are excluded from display and statistics.

Run the Seoul staging workflow before deployment. It removes other venues from generated public files, rebuilds the entire history and report, verifies chronological isolation and coverage, tests setting migration and mixed-venue rejection, and checks live/compact equality over every Seoul race.
