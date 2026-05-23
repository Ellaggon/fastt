-- House Rules v2:
-- keep legacy free-text descriptions while adding structured OTA-style rule payloads.

ALTER TABLE HouseRule ADD COLUMN payloadJson TEXT;
