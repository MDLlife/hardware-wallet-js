const HID = require('node-hid');
const messages = require('./protob/skycoin');

// Returns a handle to usbhid device
const getDevice = function() {
    const deviceInfo = HID.devices().find( function(d) {
        const isTeensy = d.manufacturer == "SatoshiLabs";
        return isTeensy;
    });
    if( deviceInfo ) {
        const device = new HID.HID( deviceInfo.path );
        return device;
    }
    return null;
};

// Prepares buffer containing message to device
// eslint-disable-next-line max-statements
const makeTrezorMessage = function(buffer, msgId) {
    const u8Array = new Uint8Array(buffer);
    const trezorMsg = new ArrayBuffer(10 + u8Array.byteLength - 1);
    const dv = new DataView(trezorMsg);
    // Adding the '##' at the begining of the header
    dv.setUint8(0, 35);
    dv.setUint8(1, 35);
    dv.setUint16(2, msgId);
    dv.setUint32(4, u8Array.byteLength);
    // Adding '\n' at the end of the header
    dv.setUint8(8, 10);
    const trezorMsg8 = new Uint8Array(trezorMsg);
    trezorMsg8.set(u8Array.slice(1), 9);
    let lengthToWrite = u8Array.byteLength;
    const chunks = [];
    let j = 0;
    while (lengthToWrite > 0) {
        const u64pack = new Uint8Array(64);
        u64pack[0] = 63;
        u64pack.set(trezorMsg8.slice(63 * j, 63 * (j + 1)), 1);
        lengthToWrite -= 63;
        chunks[j] = u64pack;
        j += 1;
    }
    return chunks;
};

// Sends Address generation request
// eslint-disable-next-line max-statements, max-lines-per-function
const deviceAddressGen = function(addressN, startIndex) {
    const dev = getDevice();
    if (dev === null) {
        // eslint-disable-next-line no-console
        console.error("Device not connected");
        return null;
    }
    const msgStructure = {
        addressN,
        startIndex
    };
    const msg = messages.SkycoinAddress.create(msgStructure);
    const buffer = messages.SkycoinAddress.encode(msg).finish();
    const chunks = makeTrezorMessage(
        buffer,
        messages.MessageType.MessageType_SkycoinAddress
    );
    const dataBytes = [];
    chunks[0].forEach((elt, i) => {
        dataBytes[i] = elt;
    });
    dev.write(dataBytes);

    dev.read(function(err, data) {
        // eslint-disable-next-line no-console
        console.error(err);
        const dv8 = new Uint8Array(data);
        const kind = data[4];
        // eslint-disable-next-line no-console
        console.log(
            "Received data", data, " msg kind: ",
            messages.MessageType[kind]
            );
        if (kind == messages.MessageType.MessageType_Failure) {
            try {
                // eslint-disable-next-line no-console
                console.log(dv8.slice(9, 39));
                const failMsg = messages.Failure.decode(dv8.slice(9, 39));
                // eslint-disable-next-line no-console
                console.log(
                    "Failure message code",
                    failMsg.code, "message: ",
                    failMsg.message
                    );
            } catch (e) {
                // eslint-disable-next-line no-console
                console.error("wire format is invalid");
            }
        }
    });
    dev.close();
    return dataBytes;
};

module.exports = {
    deviceAddressGen,
    makeTrezorMessage
};
