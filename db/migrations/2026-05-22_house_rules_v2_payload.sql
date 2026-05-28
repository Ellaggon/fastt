-- House Rules v2:
-- add structured OTA-style rule payloads.

ALTER TABLE HouseRule ADD COLUMN payloadJson TEXT;
