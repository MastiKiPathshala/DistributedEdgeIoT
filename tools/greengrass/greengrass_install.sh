build_raw_image ()
{
    # $1 config image name
    # $2 cert image name
    # $3 cert dir name

echo "Creating config image for Greengrass things"
dd if=/dev/zero of=$1 bs=1M count=1
mkfs ext4 -F $1
mkdir -p $3/mount_config/
mount -o loop,rw,sync $1 $3/mount_config
cp $3/config.json $3/mount_config/.
umount $PWD/$1
rm -rf $3/mount_config

echo "Creating certs image for Greengrass things"
dd if=/dev/zero of=$2 bs=1M count=1
mkfs ext4 -F $2
mkdir -p $3/mount_certs/
mount -o loop,rw,sync $2 $3/mount_certs
cp $ZEDEDA_DIR/root-ca.pem $3/mount_certs/.
cp $3/cloud.pem.crt $3/mount_certs/.
cp $3/private.pem.key $3/mount_certs/.
umount $PWD/$2
rm -rf $3/mount_certs
}

build_raw_disk_image()
{
    # $1 config image name
    # $2 cert image name
    # $3 cert dir name

    config=$1
    certs=$2

    echo "Creating certs disk drive for $1-$2"
    dd if=/dev/zero of=$certs bs=1M count=1
    fdisk $certs <<END
n
p



w
END
    lodev=$(losetup -f)
    startblk=$(fdisk -l $certs | grep Linux | awk '{print $2}')
    sudo losetup -o $(( $startblk * 512 )) -f $certs
    sudo mkfs.ext4 $lodev
    sudo mount $lodev /mnt
    sudo mkdir /mnt/certs
    cp $ZEDEDA_DIR/root-ca.pem /mnt/certs
    cp $3/cloud.pem.crt /mnt/certs
    cp $3/private.pem.key /mnt/certs
    sudo umount /mnt
    sudo losetup -d $lodev

    echo "Creating config disk drive for $1-$2"
    dd if=/dev/zero of=$config bs=1M count=1
    fdisk $config <<END
n
p



w
END
    lodev=$(losetup -f)
    startblk=$(fdisk -l $config | grep Linux | awk '{print $2}')
    sudo losetup -o $(( $startblk * 512 )) -f $config
    sudo mkfs.ext4 $lodev
    sudo mount $lodev /mnt
    sudo mkdir /mnt/config
    cp $ZEDEDA_DIR/root-ca.pem /mnt/config
    cp $3/config.json /mnt/config
    sudo umount /mnt
    sudo losetup -d $lodev
}

[ $# -ne 6 ] && { echo "Syntax: greengrass_install.sh --group-name <name of GG group> --core-name <prefix for of GG core and things> --num-things <No. of things to be attached>."; exit 1;}

GG_GROUP_NAME=$2
GG_THING_NAME=$4
GG_THING_NUM=$6

echo "Installing AMZN greengrass group $2 with core device $GG_THING_NAME-core and $GG_THING_NUM IoT things"

ZEDEDA_DIR=/tmp/zededa
mkdir -p $ZEDEDA_DIR
aws iam list-roles > /tmp/iam-roles.json 
IAMROLEARN=`jq -r '.Roles[] | select (..|.Service? | contains("greengrass")?) | .Arn' /tmp/iam-roles.json | head -1` 
if [ -z "$IAMROLEARN" ] 
then
aws iam create-role --role-name Greengrass-Service-Role \
--description "Allows AWS Greengrass to call AWS Services on your behalf" \
--assume-role-policy-document \
'{     
    "Version": "2012-10-17",
    "Statement": [{
        "Effect": "Allow",         
        "Principal": {             
            "Service": "greengrass.amazonaws.com"         
        },         
        "Action": "sts:AssumeRole"     
    }] 
}' > /tmp/iam-role.json
IAMROLENAME=`jq -r ".Role.RoleName" /tmp/iam-role.json` 
IAMROLEARN=`jq -r ".Role.Arn" /tmp/iam-role.json` 
aws iam attach-role-policy --policy-arn arn:aws:iam::aws:policy/service-role/AWSGreengrassResourceAccessRolePolicy --role-name $IAMROLENAME 
aws iam attach-role-policy --policy-arn arn:aws:iam::aws:policy/AWSLambdaReadOnlyAccess --role-name $IAMROLENAME 
aws iam attach-role-policy --policy-arn arn:aws:iam::aws:policy/AWSIoTFullAccess --role-name $IAMROLENAME
aws iam put-role-policy --role-name $IAMROLENAME --policy-name $IAMROLENAME-Policy --policy-document \
'{
    "Version": "2012-10-17",
    "Statement": [{
        "Sid": "Stmt1491600492000",
        "Effect": "Allow",
        "Action": [
            "greengrass:*"
        ],
        "Resource": [
            "*"
        ]
    }]
}'
aws greengrass associate-service-role-to-account --role-arn $IAMROLEARN 
else
IAMROLEARN=`jq -r '.Roles[] | select (..|.Service? | contains("greengrass")?) | .RoleName' /tmp/iam-roles.json | head -1` 
fi
#
# Create thing for Greengrass Core 
#
CERT_DIR_NAME=/tmp/zededa/$GG_THING_NAME-core
mkdir -p $CERT_DIR_NAME
aws iot create-thing --thing-name "$GG_THING_NAME-core" > /tmp/ggc-thing.json 
GG_CORE_THINGARN=`jq -r ".thingArn" /tmp/ggc-thing.json`
GG_CORE_THINGNAME=`jq -r ".thingName" /tmp/ggc-thing.json`
#
# Create Security Key / Certificate and attach them to Greengrass Core thing
#
aws iot create-keys-and-certificate --set-as-active > /tmp/ggc-cert.json 
GG_CORE_CERTARN=`jq -r ".certificateArn" /tmp/ggc-cert.json` 
jq -r ".certificatePem" /tmp/ggc-cert.json > $CERT_DIR_NAME/cloud.pem.crt 
jq -r ".keyPair.PrivateKey" /tmp/ggc-cert.json > $CERT_DIR_NAME/private.pem.key 
jq -r ".keyPair.PublicKey" /tmp/ggc-cert.json > $CERT_DIR_NAME/public.pem.key
#
# Create Common Policy for this GReengrass Group
#
aws iot list-policies > $ZEDEDA_DIR/iot-policy.json 
POLICYNAME_IOT=`jq -r '.policies[] | select (.policyName? | contains("zededa")?) | .policyName' $ZEDEDA_DIR/iot-policy.json | head -1` 
echo $POLICYNAME_IOT
if [ -z POLICYNAME_IOT ]
then
aws iot create-policy --policy-name "$GG_GROUP_NAME-IOT-Policy" --policy-document \
'{
    "Version": "2012-10-17", 
    "Statement": [{
        "Effect": "Allow", 
        "Action": [
            "iot:*", 
            "greengrass:*"
        ], 
        "Resource": "*"
    }]
}' > $ZEDEDA_DIR/iot-policy.json
POLICYNAME_IOT=`jq -r ".policyName" $ZEDEDA_DIR/iot-policy.json`
else
    echo "IOT Policy exists: $POLICYNAME_IOT"
fi
#
# Attach Security Credential to policy and thing
#
aws iot attach-principal-policy --policy-name $POLICYNAME_IOT --principal $GG_CORE_CERTARN
aws iot attach-thing-principal --thing-name $GG_CORE_THINGNAME --principal $GG_CORE_CERTARN
#
# Setup Greengrass tarball for Greengrass Core
#
#sudo tar -zxvf $SOURCE_TARBALL -C /
wget http://www.symantec.com/content/en/us/enterprise/verisign/roots/VeriSign-Class%203-Public-Primary-Certification-Authority-G5.pem 
sudo mv VeriSign-Class\ 3-Public-Primary-Certification-Authority-G5.pem $ZEDEDA_DIR/root-ca.pem 
IOTHOST=`aws iot describe-endpoint | jq -r ".endpointAddress"` 
echo "{     \"coreThing\": {         \"caPath\": \"root-ca.pem\",         \"certPath\": \"cloud.pem.crt\",         \"keyPath\": \"private.pem.key\",         \"thingArn\": \"$GG_CORE_THINGARN\",         \"iotHost\": \"$IOTHOST\",         \"ggHost\": \"greengrass.iot.us-west-2.amazonaws.com\",         \"keepAlive\": 600     },     \"runtime\": {         \"cgroup\": {             \"useSystemd\": \"yes\"         }     } }" > $CERT_DIR_NAME/config.json
echo "Creating config image for Greengrass core"
build_raw_image image.GGCore_Config_$GG_THING_NAME-core.img image.GGCore_Certs_$GG_THING_NAME-core.img $CERT_DIR_NAME
#
# Create thing for n devices 
#
index=1
echo "[" > /tmp/config-devices.json
while [ $index -le $GG_THING_NUM ]
do
THING_FILE_NAME=/tmp/zededa/ggc-thing-$index.json
CERT_FILE_NAME=/tmp/zededa/ggc-cert-$index.json
CERT_DIR_NAME=/tmp/zededa/$GG_THING_NAME-thing-$index
mkdir -p $CERT_DIR_NAME
echo $index $THING_FILE_NAME $CERT_FILE_NAME $CERT_DIR_NAME
aws iot create-thing --thing-name "$GG_THING_NAME-thing-$index" > $THING_FILE_NAME 
GG_THINGARN=`jq -r ".thingArn" $THING_FILE_NAME`
GG_THINGNAME=`jq -r ".thingName" $THING_FILE_NAME`
aws iot create-keys-and-certificate --set-as-active > $CERT_FILE_NAME
GG_CERTARN=`jq -r ".certificateArn" $CERT_FILE_NAME`
jq -r ".certificatePem" $CERT_FILE_NAME > $CERT_DIR_NAME/cloud.pem.crt 
jq -r ".keyPair.PrivateKey" $CERT_FILE_NAME > $CERT_DIR_NAME/private.pem.key 
jq -r ".keyPair.PublicKey" $CERT_FILE_NAME > $CERT_DIR_NAME/public.pem.key
echo "{      \"caPath\": \"root-ca.pem\",         \"certPath\": \"cloud.pem.crt\",         \"keyPath\": \"private.pem.key\",        \"thingName\": \"$GG_THINGNAME\",        \"iotHost\": \"$IOTHOST\"}" > $CERT_DIR_NAME/config.json 
if [ $index -gt 1 ]
then
echo ", " >> /tmp/config-devices.json
fi
echo "{     \"CertificateArn\": \"$GG_CERTARN\",     \"Id\": \"$GG_THINGNAME\",     \"SyncShadow\": true,     \"ThingArn\": \"$GG_THINGARN\" }" >> /tmp/config-devices.json 
aws iot attach-principal-policy --policy-name $POLICYNAME_IOT --principal $GG_CERTARN
aws iot attach-thing-principal --thing-name $GG_THINGNAME --principal $GG_CERTARN
build_raw_image image.GGThing_Config_$GG_THING_NAME-thing-$index.img image.GGThing_Certs_$GG_THING_NAME-thing-$index.img $CERT_DIR_NAME
true $((index=index+1))
done
echo "]" >> /tmp/config-devices.json
#
# Create a Greengrass Group
#
aws greengrass create-group --name "$GG_GROUP_NAME-Group1" > /tmp/ggc-group.json 
GGC_GROUPID=`jq -r ".Id" /tmp/ggc-group.json` 
GGC_GROUPARN=`jq -r ".Arn" /tmp/ggc-group.json` 
GGC_GROUPNAME=`jq -r ".Name" /tmp/ggc-group.json`
#
# Create Greengrass Core
#
aws greengrass create-core-definition --name "$GG_GROUP_NAME-Core" > /tmp/ggc-core.json 
GG_COREID=`jq -r ".Id" /tmp/ggc-core.json` 
echo "[{     \"CertificateArn\": \"$GG_CORE_CERTARN\",     \"Id\": \"$GG_CORE_THINGNAME\",     \"SyncShadow\": true, \"ThingArn\": \"$GG_CORE_THINGARN\" }]" > /tmp/config-cores.json 
aws greengrass create-core-definition-version --core-definition-id "$GG_COREID" --cores file:///tmp/config-cores.json  > /tmp/ggc-coreversion.json 
GG_COREVERSION=`jq -r ".Arn" /tmp/ggc-coreversion.json`
#
# Create Greengrass Device
#
aws greengrass create-device-definition --name "$GG_GROUP_NAME-Device" > /tmp/gg-device.json 
GG_DEVICEID=`jq -r ".Id" /tmp/gg-device.json` 
aws greengrass create-device-definition-version --device-definition-id "$GG_DEVICEID" --devices file:///tmp/config-devices.json  > /tmp/gg-deviceversion.json 
GG_DEVICEVERSION=`jq -r ".Arn" /tmp/gg-deviceversion.json`
#
#
#
aws iam list-roles > /tmp/iam-roles.json 
GGC_ROLELAMBDA=`jq -r '.Roles[] | select (..|.Service? | contains("lambda")?) | .Arn' /tmp/iam-roles.json | head -1` 
if [ -z "$GGC_ROLELAMBDA" ] 
then 
    echo "STOP: you must create a role that can be used by lambda functions."
aws iam create-role --role-name Basic-Lambda-Service-Role --assume-role-policy-document '{     "Version": "2012-10-17",     "Statement": [     {         "Effect": "Allow",         "Principal": {             "Service": "lambda.amazonaws.com"         },         "Action": "sts:AssumeRole"     }     ] }' > /tmp/iam-lambdarole.json 
GGC_ROLELAMBDA=`jq -r ".Role.Arn" /tmp/iam-lambdarole.json` 
sleep 30
else
    echo "Lambda Service role exists: $GGC_ROLELAMBDA"
fi
aws lambda list-aliases --function-name "HelloZededaWorld" > /tmp/ggc-lambdaHW-alias.json 
GGC_LAMBDA_HWALIASARN=`jq -r '.Aliases[] | select (.Name? | contains("storyLineMessage")?) | .AliasArn' /tmp/ggc-lambdaHW-alias.json | head -1` 
if [ -z "$GGC_LAMBDA_HWALIASARN" ] 
then 
    echo "Lambda function does not exist, creating new function"
aws lambda create-function --function-name HelloZededaWorld \
    --region us-west-2 \
    --code '{"S3Bucket": "zededa-misc-repo", "S3Key": "lambda/HelloZededaWorld.zip"}' \
    --role $GGC_ROLELAMBDA \
    --handler HelloZededaWorld.lambda_handler \
    --runtime python2.7 > /tmp/ggc-lambdaHW.json
GGC_LAMBDA_HWARN=`jq -r ".FunctionArn" /tmp/ggc-lambdaHW.json`
sleep 30
aws lambda publish-version --function-name $GGC_LAMBDA_HWARN > /tmp/ggc-lambdaHW-version.json 
GGC_LAMBDA_HWVERSNAME=`jq -r ".FunctionName" /tmp/ggc-lambdaHW-version.json` 
GGC_LAMBDA_HWVERSION=`jq -r ".Version" /tmp/ggc-lambdaHW-version.json`
aws lambda create-alias --function-name $GGC_LAMBDA_HWVERSNAME --name storyLineMessage --function-version $GGC_LAMBDA_HWVERSION > /tmp/ggc-lambdaHW-alias.json 
GGC_LAMBDA_HWALIASARN=`jq -r ".AliasArn" /tmp/ggc-lambdaHW-alias.json`
else
    echo "Lambda Function Alias exists : $GGC_LAMBDA_HWALIASARN"
fi
aws greengrass create-function-definition --name "$GG_GROUP_NAME-Functions" > /tmp/ggc-functiondef.json 
GGC_FUNCDEFID=`jq -r ".Id" /tmp/ggc-functiondef.json` 
echo "[{     \"Id\": \"uptime-lambda\",      \"FunctionArn\": \"$GGC_LAMBDA_HWALIASARN\",      \"FunctionConfiguration\": {         \"Executable\": \"greengrassHelloWorld.lambda_handler\",         \"MemorySize\": 128000,         \"Pinned\": true,         \"Timeout\": 3 } }]" > /tmp/config-functions.json
aws greengrass create-function-definition-version --function-definition-id "$GGC_FUNCDEFID" --functions file:///tmp/config-functions.json > /tmp/ggc-functions.json 
GGC_FUNCDEFVERS=`jq -r ".Arn" /tmp/ggc-functions.json`
#
#
#
aws greengrass create-subscription-definition --name "$GG_GROUP_NAME-Subscription" > /tmp/ggc-sub.json 
GGC_SUBSID=`jq -r ".Id" /tmp/ggc-sub.json` 
echo "[{     \"Id\": \"1\",     \"Source\": \"$GGC_LAMBDA_HWALIASARN\",     \"Subject\": \"#\",     \"Target\": \"cloud\" }]" > /tmp/config-subscription.json
aws greengrass create-subscription-definition-version --subscription-definition-id "$GGC_SUBSID" --subscriptions file:///tmp/config-subscription.json > /tmp/ggc-subsversion.json 
GGC_SUBSVERSION=`jq -r ".Arn" /tmp/ggc-subsversion.json`
#
#
#
aws greengrass create-logger-definition --name "$GG_GROUP_NAME-Logger" > /tmp/ggc-logger.json 
GGC_LOGGERID=`jq -r ".Id" /tmp/ggc-logger.json` 
echo "[ {         \"Id\": \"system-logs\",         \"Component\": \"GreengrassSystem\",         \"Level\": \"INFO\",         \"Space\": 5120,         \"Type\": \"FileSystem\"     },     {         \"Id\": \"lambda-logs\",         \"Component\": \"Lambda\",         \"Level\": \"DEBUG\",         \"Space\": 5120,         \"Type\": \"FileSystem\"     } ]" > /tmp/config-loggers.json 
aws greengrass create-logger-definition-version --logger-definition-id "$GGC_LOGGERID" --loggers file:///tmp/config-loggers.json > /tmp/ggc-loggerversion.json 
GGC_LOGGERVERSION=`jq -r ".Arn" /tmp/ggc-loggerversion.json`
#
# Finally Create group version to tie all of them together
#
aws greengrass create-group-version --group-id "$GGC_GROUPID" \
    --core-definition-version-arn "$GG_COREVERSION" \
    --device-definition-version-arn "$GG_DEVICEVERSION" \
    --subscription-definition-version-arn "$GGC_SUBSVERSION" \
    --function-definition-version-arn "$GGC_FUNCDEFVERS" \
    --logger-definition-version-arn "$GGC_LOGGERVERSION" \
> /tmp/ggc-grpversion.json 
GGC_GROUPIDVERSION=`jq -r ".Version" /tmp/ggc-grpversion.json`
exit 0
