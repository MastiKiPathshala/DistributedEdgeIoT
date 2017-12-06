# stop script on error
set -e

# run pub/sub sample app using certificates downloaded in package
printf "\nRunning pub/sub sample application...\n"
python /opt/zededa/basicDiscovery.py &
