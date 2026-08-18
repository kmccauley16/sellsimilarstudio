import { describe, expect, it } from "vitest";
import { initialSellerSetup, selectMerchantLocation } from "../shared/ebaySellerSetup";

describe("seller setup local selection", () => {
  it("selects a newly created Chicago warehouse in a new local form-state object", () => {
    const existingForm = {
      ...initialSellerSetup,
      fulfillmentPolicyId: "fulfillment-1",
      paymentPolicyId: "payment-1",
      returnPolicyId: "return-1",
    };

    const selectedForm = selectMerchantLocation(existingForm, "SSS-US-ILLINOIS-CHICAGO");

    expect(selectedForm).toEqual({
      fulfillmentPolicyId: "fulfillment-1",
      paymentPolicyId: "payment-1",
      returnPolicyId: "return-1",
      merchantLocationKey: "SSS-US-ILLINOIS-CHICAGO",
    });
    expect(selectedForm).not.toBe(existingForm);
    expect(existingForm.merchantLocationKey).toBe("");
  });
});
