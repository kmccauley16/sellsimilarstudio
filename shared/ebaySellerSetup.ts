export type SellerSetupValues = {
  fulfillmentPolicyId: string;
  paymentPolicyId: string;
  returnPolicyId: string;
  merchantLocationKey: string;
};

export const initialSellerSetup: SellerSetupValues = {
  fulfillmentPolicyId: "",
  paymentPolicyId: "",
  returnPolicyId: "",
  merchantLocationKey: "",
};

/**
 * This is deliberately local-form state only. Persisting the selected location
 * remains the separate responsibility of the explicit saveSellerSetup mutation.
 */
export function selectMerchantLocation(
  current: SellerSetupValues,
  merchantLocationKey: string,
): SellerSetupValues {
  return { ...current, merchantLocationKey };
}
