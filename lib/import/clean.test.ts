import { describe, expect, it } from "vitest";
import { cleanDescription } from "./clean";

describe("cleanDescription", () => {
  it.each([
    ["UPI/DR/412345678901/SWIGGY/YESB/swiggy@ybl/Payment", "Swiggy"],
    [
      "UPI-ZEPTO MARKETPLACE PRIVATE LIMITED-ZEPTO@YBL-YESB0YBLUPI-412345678901-PAYMENT FROM PHONE",
      "Zepto Marketplace",
    ],
    ["UPI/412345678901/Blinkit/blinkit@hdfcbank/HDFC BANK LTD/HDF123", "Blinkit"],
    ["POS 512345XXXXXX1234 AMAZON PAY IN", "Amazon"],
    ["NEFT DR-HDFC0001234-RAHUL SHARMA-NETBANK, MUM-N123456789", "Rahul Sharma"],
    ["IMPS-412345678901-PRIYA K-ICIC-XXXXXXXX1234-rent oct", "Priya K"],
    ["ATM WDL/HSR LAYOUT BANGALORE/412345", "ATM withdrawal"],
    ["ACH D- TP ACH ZERODHA BROKING-1234567890", "Tp Zerodha Broking"],
    ["Amazon Prime renewal", "Amazon Prime renewal"],
    ["NETFLIX.COM", "Netflix.com"],
  ])("%s → %s", (input, expected) => {
    expect(cleanDescription(input)).toBe(expected);
  });

  it("falls back to the UPI handle when everything else is noise", () => {
    expect(cleanDescription("UPI/DR/412345678901/uber.india@axisbank/UTIB")).toBe("Uber India");
  });

  it("returns empty for empty input", () => {
    expect(cleanDescription("   ")).toBe("");
  });
});
