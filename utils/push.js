// Stub - Push notification service
exports.sendPushNotification = async (userId, title, body, data) => {
    console.log(`🔔 Push stub: ${userId} - ${title}`);
    return { success: true };
};

exports.sendPushToTopic = async (topic, title, body) => {
    console.log(`🔔 Push topic stub: ${topic} - ${title}`);
    return { success: true };
};
