/**
 * National General Insurance Portal — CSS Selectors
 * Targeting the NEW blue/white portal (not the old natgenagency.com dark portal)
 *
 * IMPORTANT: These selectors are based on visual analysis of screenshots.
 * They MUST be verified against the actual portal DOM using browser DevTools.
 * Field names use NatGen's naming convention (often camelCase or PascalCase).
 */

// ── Dashboard (Screenshot 1) — Post-login starting point ─────────────
// VERIFIED from portal discovery — exact ASP.NET IDs
export const DASHBOARD = {
  // "New Quote" section on left sidebar
  stateDropdown: '#ctl00_MainContent_wgtMainMenuNewQuote_ddlState',
  productDropdown: '#ctl00_MainContent_wgtMainMenuNewQuote_ddlProduct',
  // Begin is an <a> tag with href="javascript: void(0);" — NOT a submit button
  beginButton: '#ctl00_MainContent_wgtMainMenuNewQuote_btnContinue',
};

// ── Client Search (Screenshot 2-3) — VERIFIED from discovery ─────────
export const CLIENT_SEARCH_VERIFIED = {
  firstName: '#MainContent_txtFirstName',
  lastName: '#MainContent_txtLastName',
  zipCode: '#MainContent_txtZipCode',
  searchButton: '#MainContent_btnSearch',
  addNewCustomerButton: '#MainContent_btnAddNewClient',
};

// ── Login ────────────────────────────────────────────────────────────
export const LOGIN = {
  userIdField: 'input[name="txtUserID"], input[name="UserID"], #txtUserID',
  signInButton: 'input[type="submit"][value="SIGN IN"], button:has-text("SIGN IN"), input[value="Sign In"]',
  passwordField: 'input[name="txtPassword"], input[type="password"], #txtPassword',
  twoFaSelect: 'input[value="text"], label:has-text("text message")',
  twoFaCodeField: 'input[name="txtCode"], input[name="code"], #txtCode',
  twoFaSubmit: 'button:has-text("Verify"), input[value="Verify"]',
  errorMessage: '.error-message, .alert-danger, #lblError, .validation-summary-errors',
};

// ── Client Search (Screenshot 2-3) ───────────────────────────────────
export const CLIENT_SEARCH = {
  firstNameField: 'input[name="FirstName"], input[id*="FirstName"]',
  lastNameField: 'input[name="LastName"], input[id*="LastName"]',
  zipCodeField: 'input[name="ZipCode"], input[id*="ZipCode"], input[name="Zip"]',
  searchButton: 'button:has-text("Search"), input[type="submit"][value="Search"]',
  noResultsText: 'text=No Results Found',
  addNewCustomerButton: 'button:has-text("Add New Customer"), input[value="Add New Customer"], a:has-text("Add New Customer")',
};

// ── Client Information (Screenshot 4) ────────────────────────────────
// VERIFIED from portal discovery — exact ASP.NET field IDs
export const CLIENT_INFO = {
  // General Information
  agentField: '#MainContent_ucGeneralInformation_txtAgent',
  policyEffectiveDate: '#MainContent_ucGeneralInformation_txtPolicyEffDate',
  producerDropdown: 'select[id*="ucGeneralInformation"][id*="Producer"]',
  planDropdown: 'select[id*="ucGeneralInformation"][id*="Plan"]',

  // Named Insured — exact IDs from discovery
  firstName: '#MainContent_ucNamedInsured_txtFirstName',
  middleName: '#MainContent_ucNamedInsured_txtMiddleName',
  lastName: '#MainContent_ucNamedInsured_txtLastName',
  dateOfBirth: '#MainContent_ucNamedInsured_txtDateOfBirth',
  ssn1: '#MainContent_ucNamedInsured_txtSSN1',
  ssn2: '#MainContent_ucNamedInsured_txtSSN2',
  ssn3: '#MainContent_ucNamedInsured_txtSSN3',
  suffixDropdown: 'select[id*="ucNamedInsured"][id*="Suffix"]',
  // Dropdowns — ASP.NET naming pattern: MainContent_ucNamedInsured_ddl*
  genderDropdown: '#MainContent_ucNamedInsured_ddlGender, select[id*="ucNamedInsured"][id*="Gender"]',
  maritalStatusDropdown: '#MainContent_ucNamedInsured_ddlMaritalStatus, select[id*="ucNamedInsured"][id*="Marital"]',
  occupationDropdown: '#MainContent_ucNamedInsured_ddlOccupation, select[id*="ucNamedInsured"][id*="Occupation"]',
  coApplicant: '#MainContent_ucNamedInsured_ddlCoApplicant, select[id*="ucNamedInsured"][id*="CoApplicant"]',

  // Contact Information — phone is split into 3 fields
  phoneType: '#MainContent_ucContactInfo_ucPhoneNumber_ddlPhoneType, select[id*="ucContactInfo"][id*="PhoneType"]',
  phoneAreaCode: '#MainContent_ucContactInfo_ucPhoneNumber_txtAreaCode',
  phonePrefix: '#MainContent_ucContactInfo_ucPhoneNumber_txtPrefix',
  phoneLineNumber: '#MainContent_ucContactInfo_ucPhoneNumber_txtLineNumber',
  phoneExtension: '#MainContent_ucContactInfo_ucPhoneNumber_txtExtension',
  emailAddress: '#MainContent_ucContactInfo_ucEmailAddress_txtEmailAddress',
  confirmEmail: '#MainContent_ucContactInfo_ucEmailAddress_txtEmailAddressConfirmation',
  optInEmails: '#MainContent_ucContactInfo_ddlOptIn, select[id*="ucContactInfo"][id*="OptIn"]',
  consentCalls: '#MainContent_ucContactInfo_ddlAutomatedContact, #MainContent_ucContactInfo_ddlConsent',

  // Residential Address — exact IDs from discovery
  streetAddress1: '#MainContent_ucResidentialAddress_txtAddress',
  streetAddress2: '#MainContent_ucResidentialAddress_txtAddress2',
  city: '#MainContent_ucResidentialAddress_txtCity',
  stateDropdown: '#MainContent_ucResidentialAddress_ddlState, select[id*="ucResidentialAddress"][id*="State"]',
  zipCode: '#MainContent_ucResidentialAddress_txtZipCode',
  zip4: '#MainContent_ucResidentialAddress_txtZip4',
  deedCorrection: 'input[id*="ucResidentialAddress"][id*="Deed"]',
  residenceLessThan3: 'select[id*="ucResidentialAddress"][id*="Residence"]',

  // Continue button — exact ID from discovery
  nextButton: '#MainContent_btnContinue, input[id="MainContent_btnContinue"]',
};

// ── Quote Prefill (Screenshot 5) ─────────────────────────────────────
export const QUOTE_PREFILL = {
  // Drivers section
  driverAcceptDropdown: 'select[id*="Accept"], select[name*="Accept"]',
  acceptAllDriversButton: 'button:has-text("Accept All Additional Drivers"), a:has-text("Accept All")',
  rejectAllDriversButton: 'button:has-text("Reject All"), a:has-text("Reject All")',

  // Vehicles section
  vehicleAcceptRadio: 'input[type="radio"][value="Accept"], input[name*="Accept"]',
  acceptAllVehiclesButton: 'button:has-text("Accept All Vehicles"), a:has-text("Accept All Vehicles")',

  nextButton: 'button:has-text("Next"), input[value="Next"]',
  previousButton: 'button:has-text("Previous"), input[value="Previous"]',
};

// ── Home: Property Information (Screenshot 6) ────────────────────────
export const HOME_PROPERTY = {
  // Dwelling Information
  policyForm: 'select[name="PolicyForm"], select[id*="PolicyForm"]',
  residenceClass: 'select[name="ResidenceClass"], select[id*="ResidenceClass"]',
  occupancy: 'select[name="Occupancy"], select[id*="Occupancy"]',
  structure: 'select[name="Structure"], select[id*="Structure"]',
  yearBuilt: 'input[name="YearBuilt"], input[id*="YearBuilt"]',
  numberOfFamilies: 'select[name="NumberOfFamilies"], select[id*="NumberOfFamilies"]',
  construction: 'select[name="Construction"], select[id*="Construction"]',

  // Additional Information
  namedInsuredType: 'select[name="NamedInsuredType"], select[id*="NamedInsuredType"]',
  datePurchased: 'input[name="DatePurchased"], input[id*="DatePurchased"]',
  squareFoot: 'input[name="SquareFoot"], input[id*="SquareFoot"], input[id*="SqFt"]',
  numberOfStories: 'select[name="NumberOfStories"], select[id*="NumberOfStories"]',
  roofType: 'select[name="RoofType"], select[id*="RoofType"]',
  primaryHeatType: 'select[name="PrimaryHeatType"], select[id*="HeatType"]',
  solidFuelStoves: 'select[name="SolidFuelStoves"], select[id*="SolidFuel"]',
  roofShape: 'select[name="RoofShape"], select[id*="RoofShape"]',
  hailResistant: 'select[name="HailResistant"], select[id*="HailResist"]',
  underConstruction: 'select[name="UnderConstruction"], select[id*="Construction"]',
  smokeDetectors: 'select[name="SmokeDetectors"], select[id*="Smoke"]',
  burglarAlarm: 'select[name="BurglarAlarm"], select[id*="BurglarAlarm"]',
  fireAlarm: 'select[name="FireAlarm"], select[id*="FireAlarm"]',
  sprinklerSystem: 'select[name="SprinklerSystem"], select[id*="Sprinkler"]',
  waterShutoff: 'select[name="WaterShutoff"], select[id*="WaterShutoff"]',
  oilTank: 'select[name="OilTank"], select[id*="OilTank"]',
  homeownerPremiumPayer: 'select[name="PremiumPayer"], select[id*="PremiumPayer"]',

  nextButton: 'button:has-text("Next"), input[value="Next"]',
};

// ── Home: Replacement Cost (Screenshot 7) ────────────────────────────
export const HOME_REPLACEMENT = {
  squareFootage: 'input[name="SquareFootage"], input[id*="SquareFootage"]',
  numberOfStories: 'select[name="NumberOfStories"], select[id*="NumberOfStories"]',
  style: 'select[name="Style"], select[id*="Style"]',
  foundationType1: 'select[name="FoundationType1"], select[id*="Foundation"]',
  finishedBasement1: 'select[name="FinishedBasement1"], select[id*="Basement"]',
  exteriorWallFinish1: 'select[name="ExteriorWallFinish1"], select[id*="ExteriorWall"]',
  roofShape1: 'select[name="RoofShape1"], select[id*="RoofShape"]',
  kitchenGrade: 'select[name="KitchenGrade"], select[id*="KitchenGrade"]',
  bathGrade: 'select[name="BathGrade"], select[id*="BathGrade"]',
  numberOfFullBath: 'input[name="NumberOfFullBath"], input[id*="FullBath"]',
  numberOfHalfBath: 'input[name="NumberOfHalfBath"], input[id*="HalfBath"]',
  numberOfFirePlaces: 'input[name="NumberOfFirePlaces"], input[id*="FirePlace"]',
  numberOfGarages: 'select[name="NumberOfGarages"], select[id*="Garages"]',
  recalculateButton: 'button:has-text("Recalculate"), input[value="Recalculate"]',
  replacementCostValue: '.replacement-cost, #ReplacementCost, td:has-text("Replacement Cost")',
  nextButton: 'button:has-text("Next"), input[value="Next"]',
};

// ── Home: Coverage (Screenshot 8) ────────────────────────────────────
export const HOME_COVERAGE = {
  dwellingProtection: 'input[name="CoverageA"], input[id*="CoverageA"], input[id*="DwellingProtection"]',
  otherStructuresPercent: 'select[name="CoverageBPercent"], select[id*="CoverageB"]',
  personalPropertyPercent: 'select[name="CoverageCPercent"], select[id*="CoverageC"]',
  additionalLivingPercent: 'select[name="CoverageDPercent"], select[id*="CoverageD"]',
  allPerilsDeductible: 'select[name="AllPerilsDeductible"], select[id*="AllPerils"]',
  windstormDeductible: 'select[name="WindstormDeductible"], select[id*="Windstorm"]',
  sppCheckbox: 'input[name="SPP"], input[id*="SPP"]',
  umbrellaCheckbox: 'input[name="Umbrella"], input[id*="Umbrella"]',
  familyLiability: 'input[name="CoverageX"], input[id*="CoverageX"]',
  guestMedical: 'select[name="CoverageY"], select[id*="CoverageY"]',
  nextButton: 'button:has-text("Next"), input[value="Next"]',
};

// ── Home: Underwriting (Screenshot 9) ────────────────────────────────
export const HOME_UNDERWRITING = {
  priorInsuranceCo: 'select[name="PriorInsuranceCo"], select[id*="PriorInsurance"]',
  priorBICoverage: 'select[name="PriorBICoverage"], select[id*="PriorBI"]',
  expirationDate: 'input[name="ExpirationDate"], input[id*="ExpirationDate"]',
  yearsContinuous: 'select[name="YearsContinuous"], select[id*="YearsContinuous"]',
  siteAccess: 'select[name="SiteAccess"], select[id*="SiteAccess"]',
  floodZone: 'select[name="FloodZone"], select[id*="FloodZone"]',
  swimmingPool: 'select[name="SwimmingPool"], select[id*="SwimmingPool"]',
  trampoline: 'select[name="Trampoline"], select[id*="Trampoline"]',
  debris: 'select[name="Debris"], select[id*="Debris"]',
  goPaperless: 'select[name="GoPaperless"], select[id*="GoPaperless"]',
  nextButton: 'button:has-text("Next"), input[value="Next"]',
};

// ── Loss History (Screenshot 10) ─────────────────────────────────────
export const LOSS_HISTORY = {
  noLossHistoryText: 'text=No Loss History',
  addLink: 'a:has-text("Add")',
  nextButton: 'button:has-text("Next"), input[value="Next"]',
};

// ── Auto: Drivers (Screenshot 11) ────────────────────────────────────
export const AUTO_DRIVERS = {
  firstName: 'input[name="FirstName"], input[id*="FirstName"]',
  lastName: 'input[name="LastName"], input[id*="LastName"]',
  dateOfBirth: 'input[name="DateOfBirth"], input[id*="DOB"]',
  gender: 'select[name="Gender"], select[id*="Gender"]',
  maritalStatus: 'select[name="MaritalStatus"], select[id*="MaritalStatus"]',
  relationshipStatus: 'select[name="RelationshipStatus"], select[id*="Relationship"]',
  operatorType: 'select[name="OperatorType"], select[id*="OperatorType"]',
  yearsExperience: 'input[name="YearsExperience"], input[id*="YearsExperience"]',
  driverLicenseStatus: 'select[name="DriverLicenseStatus"], select[id*="LicenseStatus"]',
  licenseState: 'select[name="LicenseState"], select[id*="LicenseState"]',
  occupation: 'select[name="Occupation"], select[id*="Occupation"]',
  dynamicDrive: 'select[name="DynamicDrive"], select[id*="DynamicDrive"]',
  emailAddress: 'input[name="EmailAddress"], input[id*="Email"]',
  saveButton: 'button:has-text("Save"), input[value="Save"]',
  nextButton: 'button:has-text("Next"), input[value="Next"]',
};

// ── Auto: Driver Violations (Screenshot 12) ──────────────────────────
export const AUTO_VIOLATIONS = {
  noViolationText: 'text=No',
  violationsSummaryTable: 'table:has-text("Driver Violations Summary")',
  comprehensiveLossesTable: 'table:has-text("Comprehensive Losses")',
  nextButton: 'button:has-text("Next"), input[value="Next"]',
};

// ── Auto: Vehicles (Screenshot 13) ───────────────────────────────────
export const AUTO_VEHICLES = {
  vin: 'input[name="VIN"], input[id*="VIN"]',
  vehicleType: 'select[name="VehicleType"], select[id*="VehicleType"]',
  modelYear: 'input[name="ModelYear"], input[id*="ModelYear"]',
  make: 'select[name="Make"], select[id*="Make"]',
  model: 'select[name="Model"], select[id*="Model"]',
  purchasedDate: 'input[name="PurchasedDate"], input[id*="PurchasedDate"]',
  baseListPrice: 'input[name="BaseListPrice"], input[id*="BaseListPrice"]',
  garagingAddress: 'select[name="GaragingAddress"], select[id*="GaragingAddress"]',
  garagingState: 'input[name="GaragingState"], input[id*="GaragingState"]',
  garagingZip: 'input[name="GaragingZip"], input[id*="GaragingZip"]',
  ownershipStatus: 'select[name="OwnershipStatus"], select[id*="Ownership"]',
  antiTheft: 'select[name="AntiTheft"], select[id*="AntiTheft"]',
  annualMileage: 'input[name="AnnualMileage"], input[id*="AnnualMileage"]',
  saveButton: 'button:has-text("Save"), input[value="Save"]',
  nextButton: 'button:has-text("Next"), input[value="Next"]',
};

// ── Auto: Vehicle Coverages (Screenshot 14) ──────────────────────────
export const AUTO_COVERAGES = {
  // Policy-level coverages
  coverageLevel: 'select[name="CoverageLevel"], select[id*="CoverageLevel"]',
  combinedSingleLimits: 'select[name="CombinedSingleLimits"], select[id*="CombinedSingle"]',
  bodilyInjury: 'select[name="BodilyInjury"], select[id*="BodilyInjury"]',
  propertyDamage: 'select[name="PropertyDamage"], select[id*="PropertyDamage"]',
  medicalPayments: 'select[name="MedicalPayments"], select[id*="MedicalPayments"]',
  extendedNonOwned: 'select[name="ExtendedNonOwned"], select[id*="ExtendedNonOwned"]',
  uninsuredMotorist: 'select[name="UninsuredMotorist"], select[id*="UninsuredMotorist"]',
  firstAccidentForgiveness: 'select[name="FirstAccidentForgiveness"], select[id*="AccidentForgiveness"]',

  // Per-vehicle coverages
  umPropertyDamage: 'select[name*="UMPropertyDamage"], select[id*="UMPropertyDamage"]',
  collision: 'select[name*="Collision"], select[id*="Collision"]',
  comprehensive: 'select[name*="Comprehensive"], select[id*="Comprehensive"]',
  autoLoanLease: 'select[name*="AutoLoanLease"], select[id*="AutoLoan"]',
  roadsideAssistance: 'select[name*="RoadsideAssistance"], select[id*="Roadside"]',
  transportationExpense: 'select[name*="TransportationExpense"], select[id*="Transportation"]',

  nextButton: 'button:has-text("Next"), input[value="Next"]',
};

// ── Auto: Underwriting (Screenshot 15) ───────────────────────────────
export const AUTO_UNDERWRITING = {
  priorInsuranceCo: 'select[name="PriorInsuranceCo"], select[id*="PriorInsurance"]',
  priorBICoverage: 'select[name="PriorBICoverage"], select[id*="PriorBI"]',
  priorExpirationDate: 'input[name="PriorExpirationDate"], input[id*="ExpirationDate"]',
  monthsMostRecent: 'select[name="MonthsMostRecent"], select[id*="MonthsMostRecent"]',
  insuranceExperienceOverride: 'select[name="InsuranceExperienceOverride"], select[id*="InsuranceExperience"]',
  yearsWithPrior: 'input[name="YearsWithPrior"], input[id*="YearsWithPrior"]',
  namedInsuredType: 'select[name="NamedInsuredType"], select[id*="NamedInsuredType"]',
  ownsResidentialProperty: 'select[name="OwnsResidentialProperty"], select[id*="OwnsResidential"]',
  nextButton: 'button:has-text("Next"), input[value="Next"]',
};

// ── Premium Summary (Screenshot 16) ──────────────────────────────────
export const PREMIUM_SUMMARY = {
  rateTable: 'table:has-text("Premium/Fee"), table:has-text("Amount")',
  autoPremiumRow: 'tr:has-text("Auto Premium")',
  homePremiumRow: 'tr:has-text("Home Premium")',
  totalRow: 'tr:has-text("Total")',
  quoteNumber: '.quote-number, [id*="QuoteNumber"], text=/Quote \\d+/',
  payMethodTerm: 'select[name="Term"], select[id*="Term"]',
  payMethodType: 'select[name="PayMethod"], select[id*="PayMethod"]',
  payPlan: 'select[name="PayPlan"], select[id*="PayPlan"]',
  reRateButton: 'button:has-text("Re-Rate"), input[value="Re-Rate"]',
  quoteProposalButton: 'button:has-text("Quote Proposal"), input[value="Quote Proposal"]',
  viewReportsButton: 'button:has-text("View Reports"), a:has-text("View Reports Page")',
};

// ── Sidebar Navigation ───────────────────────────────────────────────
export const SIDEBAR = {
  overview: 'a:has-text("Overview")',
  clientInformation: 'a:has-text("Client Information")',
  quotePrefill: 'a:has-text("Quote Prefill")',
  propertyInformation: 'a:has-text("Property Information")',
  replacementCost: 'a:has-text("Replacement Cost")',
  coverage: 'a:has-text("Coverage")',
  homeUnderwriting: 'a:has-text("Home Underwriting")',
  lossHistory: 'a:has-text("Loss History")',
  drivers: 'a:has-text("Drivers")',
  driverViolations: 'a:has-text("Driver Violations")',
  vehicles: 'a:has-text("Vehicles")',
  vehicleCoverages: 'a:has-text("Vehicle Coverages")',
  autoUnderwriting: 'a:has-text("Auto Underwriting")',
  premiumSummary: 'a:has-text("Premium Summary")',
  billing: 'a:has-text("Billing")',
  finalUnderwriting: 'a:has-text("Final Underwriting")',
  wrapUp: 'a:has-text("Wrap Up")',
};
