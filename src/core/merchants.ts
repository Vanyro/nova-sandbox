import type { Category } from "./personas.js";

export interface MerchantData {
  name: string;
  category: Category;
}

export const MERCHANTS: Record<Category, string[]> = {
  food: [
    "Whole Foods Market",
    "Trader Joes",
    "Starbucks",
    "Chipotle",
    "Panera Bread",
    "Local Cafe",
    "Pizza Hut",
    "Subway",
    "McDonalds",
    "Five Guys",
  ],
  rent: ["Property Management Co", "Landlord Payment", "Apartment Complex"],
  utilities: [
    "Electric Company",
    "Water & Sewer",
    "Internet Provider",
    "Gas Company",
    "Phone Service",
  ],
  salary: ["Employer Payroll", "Direct Deposit", "Contractor Payment"],
  investments: [
    "Robinhood",
    "E-Trade",
    "Charles Schwab",
    "Vanguard",
    "Fidelity",
    "Coinbase",
    "Investment Return",
  ],
  shopping: [
    "Amazon",
    "Target",
    "Walmart",
    "Best Buy",
    "Apple Store",
    "Nike",
    "Zara",
    "H&M",
    "IKEA",
  ],
  transport: [
    "Uber",
    "Lyft",
    "Gas Station",
    "Public Transit",
    "Parking Meter",
    "Car Service",
  ],
  entertainment: [
    "Movie Theater",
    "Concert Venue",
    "Streaming Service",
    "Gaming Store",
    "Bowling Alley",
    "Bar & Grill",
  ],
  delivery: ["DoorDash", "Uber Eats", "Grubhub", "Instacart", "Amazon Fresh"],
  subscriptions: [
    "Netflix",
    "Spotify",
    "Apple Music",
    "Adobe Creative",
    "Gym Membership",
    "Amazon Prime",
  ],
  education: [
    "University Bookstore",
    "Online Course",
    "Tuition Payment",
    "Study Materials",
  ],
  healthcare: [
    "Pharmacy",
    "Doctor Visit",
    "Dental Office",
    "Health Insurance",
    "CVS",
    "Walgreens",
  ],
  travel: ["Airline", "Hotel Booking", "Airbnb", "Travel Agency", "Car Rental"],
  transfer: ["Internal Transfer", "P2P Payment", "Venmo", "Zelle"],
  other: ["Miscellaneous", "ATM Withdrawal", "Fee", "Refund"],
};

export const CITIES = [
  "New York",
  "Los Angeles",
  "Chicago",
  "Houston",
  "Phoenix",
  "Philadelphia",
  "San Antonio",
  "San Diego",
  "Dallas",
  "San Jose",
  "Austin",
  "Seattle",
  "Denver",
  "Boston",
  "Portland",
  "Miami",
  "Atlanta",
  "San Francisco",
];

export function getMerchantForCategory(
  category: Category,
  rng: () => number,
): string {
  const merchants = MERCHANTS[category];
  const index = Math.floor(rng() * merchants.length);
  return merchants[index] ?? "Unknown Merchant";
}

export function getRandomCity(rng: () => number): string {
  const index = Math.floor(rng() * CITIES.length);
  return CITIES[index] ?? "Unknown City";
}

export function generateTransactionReference(rng: () => number): string {
  const prefix = "TXN";
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.floor(rng() * 1000000)
    .toString(36)
    .toUpperCase()
    .padStart(6, "0");
  return `${prefix}-${timestamp}-${random}`;
}

export function generateDescription(
  type: "credit" | "debit",
  category: Category,
  merchant: string,
): string {
  if (type === "credit") {
    switch (category) {
      case "salary":
        return `Salary payment from ${merchant}`;
      case "investments":
        return `Investment return from ${merchant}`;
      case "transfer":
        return `Transfer from ${merchant}`;
      default:
        return `Payment received from ${merchant}`;
    }
  } else {
    return `Payment to ${merchant}`;
  }
}
