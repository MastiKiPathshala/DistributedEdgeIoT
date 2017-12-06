#
# Copyright 2010-2017 Amazon.com, Inc. or its affiliates. All Rights Reserved.
#

# greengrassHelloWorld.py
# Demonstrates a simple publish to a topic using Greengrass core sdk
# This lambda function will retrieve underlying platform information and send
# a hello world message along with the platform information to the topic 'hello/world'
# The function will sleep for five seconds, then repeat.  Since the function is
# long-lived it will run forever when deployed to a Greengrass core.  The handler
# will NOT be invoked in our example since the we are executing an infinite loop.

import greengrasssdk
import json
import platform
from threading import Timer
import time


# Creating a greengrass core sdk client
client = greengrasssdk.client('iot-data')

# Retrieving platform information to send from Greengrass Core
myPlatform = platform.platform()
if not myPlatform:
    myPlatform = "Unknown GG Core platform"
thingFilePath = '/etc/zededa/thinglist'

# When deployed to a Greengrass core, this code will be executed immediately
# as a long-lived lambda function.  The code will enter the infinite while loop
# below.
# This will report health of Greengrass Core and "Things" connected to it every
# 5 sec. If a Greengrass Thing has not updated its status for an hour, it will 
# disappear from the list. 

def greengrass_hello_world_run():
    try:
        with open (thingFilePath) as tFile:
            thingList = tFile.read()
            thingListJson = json.loads (thingList)
            tFile.close()
        # end-with
    except Exception as e:
        print ("No thing is registered")
        thingListJson = []
    # end-try-except
    coreId = {
        "CoreName": "saa",
        "AppName": "ZededaGGDemoApp",
        "AppUUID": "208-2017-12-04",
        "Platform": myPlatform,
        "Time": time.asctime()
    }
    coreMsg = {
        "coreId": coreId,
        "thingList": thingListJson
    }

    client.publish(topic='zededa/greengrass/report', payload=json.dumps(coreMsg))

    # Asynchronously schedule this function to be run again in 5 seconds
    Timer(5, greengrass_hello_world_run).start()
# end-def-greengrass_hello_world_run

# Execute the function above
greengrass_hello_world_run()


# This is a dummy handler and will not be invoked
# Instead the code above will be executed in an infinite loop for our example
def function_handler(event, context):
    return

