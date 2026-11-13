/**
 * Expense / deduction features are built but hidden for now (the focus is: slip -> confirm -> confirmed table).
 * Set FEATURE_EXPENSES=on to show them again. The code, tables and audit trail stay in place either way.
 */
export const expensesEnabled = () => process.env.FEATURE_EXPENSES === 'on';
