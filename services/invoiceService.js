// Stub - Invoice service
exports.createInvoice = async (data) => {
    console.log(`🧾 Invoice stub: created`);
    return { success: true, invoiceId: 'stub-' + Date.now() };
};
