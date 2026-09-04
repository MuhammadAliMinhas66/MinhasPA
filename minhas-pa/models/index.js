// models/index.js
// Single import point. Requiring this file registers every schema with
// Mongoose exactly once (models are cached by name), and every collection
// listed below is created automatically — by code — the first time a
// document is written to it. Nothing here needs a manual "CREATE
// COLLECTION" step; Mongo creates it on first insert.
module.exports = {
  User: require('./User'),
  Loan: require('./Loan'),
  Rent: require('./Rent'),
  Expense: require('./Expense'),
  ExpenseCategory: require('./ExpenseCategory'),
  Setting: require('./Setting'),
  Budget: require('./Budget'),
  Bill: require('./Bill'),
  BillCategory: require('./BillCategory'),
  BillCredential: require('./BillCredential'),
  BillPayment: require('./BillPayment'),
  Investment: require('./Investment'),
  MarketPrice: require('./MarketPrice'),
  InvestmentPriceHistory: require('./InvestmentPriceHistory'),
  SalaryPlan: require('./SalaryPlan'),
  SalaryItem: require('./SalaryItem'),
  SavingsEntry: require('./SavingsEntry'),
  Committee: require('./Committee'),
  CommitteePayment: require('./CommitteePayment'),
};
