// Two-word merchants that appear in the keyword strings below; matched as phrases.
const MULTI_WORD = [
  "tata power",
  "google one",
  "nature's basket",
  "namma yatri",
  "air india",
  "urban company",
  "tata play",
  "reliance fresh",
];

function phrases(words: string): string[] {
  let rest = ` ${words} `;
  const found: string[] = [];
  for (const phrase of MULTI_WORD) {
    if (rest.includes(` ${phrase} `)) {
      found.push(phrase);
      rest = rest.replace(` ${phrase} `, " ");
    }
  }
  return [...found, ...rest.trim().split(/\s+/).filter(Boolean)];
}

/**
 * Built-in merchant/keyword → default category name. Used when the user has
 * no learned rule yet. Keys are lower-case; multi-word keys match as phrases.
 * Adding an Indian merchant here is an easy first contribution.
 */
export const MERCHANT_CATEGORIES: Record<string, string> = Object.fromEntries(
  Object.entries({
    "Food & Dining":
      "swiggy zomato eatsure dominos domino's pizza mcdonalds mcdonald's kfc burger starbucks chaayos cafe coffee chai tea restaurant dinner lunch breakfast biryani dine food snacks bakery haldiram",
    Groceries:
      "bigbasket blinkit zepto instamart dmart jiomart grofers grocery groceries vegetables veggies fruits milk kirana supermarket more reliance fresh nature's basket",
    Transport: "uber ola rapido metro auto cab taxi petrol diesel fuel parking fastag toll namma yatri bus",
    Shopping: "amazon flipkart myntra ajio nykaa meesho croma decathlon ikea tatacliq shopping clothes shoes",
    Subscriptions:
      "netflix spotify hotstar jiohotstar prime youtube premium icloud google one jiocinema sonyliv zee5 chatgpt subscription",
    "Bills & Utilities":
      "electricity bescom tata power adani airtel jio vodafone vi bsnl broadband wifi internet gas water recharge dth tatasky tata play bill",
    Health: "pharmacy medicine medicines apollo 1mg pharmeasy netmeds hospital doctor clinic lab practo gym cult",
    Entertainment: "movie movies pvr inox bookmyshow concert games steam playstation",
    Travel:
      "makemytrip goibibo irctc indigo air india vistara akasa redbus oyo airbnb hotel flight train cleartrip yatra trip",
    Education: "udemy coursera books book course tuition school college",
    Insurance: "lic insurance policybazaar acko",
    "Personal care": "salon haircut spa urban company grooming",
    "Gifts & Donations": "gift donation charity",
    "Fees & Charges": "charges charge penalty",
    Rent: "rent nobroker",
    Family: "family parents",
    Salary: "salary payroll",
    Interest: "interest",
    Refund: "refund cashback reversal",
    Freelance: "freelance invoice client",
  }).flatMap(([category, words]) => phrases(words).map((word) => [word, category])),
);
