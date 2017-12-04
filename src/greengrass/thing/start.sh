# stop script on error
set -e

# run pub/sub sample app using certificates downloaded in package
printf "\nRunning pub/sub sample application...\n"
python basicDiscovery.py -e a3ff5o33oqvz5g.iot.us-west-2.amazonaws.com -r root-CA.crt -c GG-testcore-thing.cert.pem -k GG-testcore-thing.private.key -n Rimjhim-test1_Thing_1
