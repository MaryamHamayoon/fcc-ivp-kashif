// The process's own time zone becomes the one IVP_TEST_ZONE names, so the map's tests also run as a reader far from Washington sees them.
if (process.env.IVP_TEST_ZONE) process.env.TZ = process.env.IVP_TEST_ZONE;
