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
import time

# Creating a greengrass core sdk client
client = greengrasssdk.client('iot-data')

myPlatform = platform.platform()
if not myPlatform:
    myPlatform = "Unknown GG Core platform"
# end-if

thingListFile = '/etc/zededa/thinglist'

deviceMROTopic = 'zededa/mro/device'

def send_device_mro(thingId, mroType):
    coreId = {
        "CoreName": "saa",
        "AppName": "ZededaGGDemoApp",
        "AppUUID": "ZededaGGDemoApp",
        "Platform": myPlatform,
        "Time": time.asctime()
    }
    mroMsg = {
        "coreId": coreId,
        "thingId": thingId,
        "mroType": mroType,
        "CreatedAt": thingId["UpdatedAt"]
    }
    client.publish (topic=deviceMROTopic, payload=json.dumps(mroMsg))
    return True
# end-def-send_device_mro

def function_handler(event, context):
    with open (thingListFile, 'r') as tFile:
        thingList = tFile.read()
        tFile.close ()
    # end-with
    thingListJson = json.loads(thingList)
    thingFound = False
    for thing in thingListJson:
        if thing["ThingName"] == event["ThingName"]:
            thing["UpdatedAt"] = event["Time"]
            thingFound = True
            thingId = thing
        # end-if
    # end-for
    if thingFound == False:
        thingId = {
            "ThingName": event["ThingName"],
            "AppName": event["AppName"],
            "AppUUID": event["AppUUID"],
            "Platform": event["Platform"],
            "UpdatedAt": event["Time"]
        }
        thingListJson.append(thingId)
    # end-if
    print (thingListJson)
    with open (thingListFile, 'w') as tFile:
        tFile.write (json.dumps(thingListJson))
        tFile.close()
    # end-with
    if float(event["Data"]["cpuUtilization"]) > 3.00:
        send_device_mro (thingId, "High CPU")
    # end-if
    if int(event["Data"]["freeMemory"]) < 3500000:
        send_device_mro (thingId, "Low Memory")
    # end-if
    return True
# end-def-function_handler
