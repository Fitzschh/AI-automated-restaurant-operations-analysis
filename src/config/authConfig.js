export const AUTH_CONFIG = {
    adminEmail: 'fitzhofer@gmail.com',
    branches: {
        branch1: {
            email: 'pamaybay88@gmail.com',
            name: 'Branch 1'
        },
        branch2: {
            email: 'doralyncascato3@gmail.com',
            name: 'Branch 2'
        },
        branch3: {
            email: 'dummy@dummy.com',
            name: 'Branch 3'
        }
    }
};

export function isUserAdmin(email) {
    return email === AUTH_CONFIG.adminEmail;
}

export function getUserBranch(email) {
    if (isUserAdmin(email)) return 'admin';
    return Object.keys(AUTH_CONFIG.branches).find(
        id => AUTH_CONFIG.branches[id].email === email
    );
}

export function canAccessBranch(email, requestedBranchId) {
    if (isUserAdmin(email)) return true;
    return AUTH_CONFIG.branches[requestedBranchId]?.email === email;
}
