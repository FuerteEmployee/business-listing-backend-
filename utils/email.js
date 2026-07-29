// Stub - Email service
exports.sendEmail = async (to, subject, html) => {
    console.log(`📧 Email stub: ${to} - ${subject}`);
    return { success: true };
};
