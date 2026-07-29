const { authorize } = require('./middleware/authMiddleware');

const req = {
    user: {
        role: 'Brand Owner'
    }
};

const res = {
    status: function(code) {
        this.code = code;
        return this;
    },
    json: function(data) {
        this.data = data;
        return this;
    }
};

const next = () => {
    console.log('Next called - Authorization success');
};

const authMiddleware = authorize('Super Admin', 'Brand Owner', 'Company Owner');
authMiddleware(req, res, next);

if (res.data) {
    console.log('Authorization failed with:', res.data);
}
