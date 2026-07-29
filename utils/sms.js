// Stub - SMS service
exports.sendSMS = async (phone, message) => {
    console.log(`📱 SMS stub: ${phone} - ${message}`);
    return { success: true };
};
