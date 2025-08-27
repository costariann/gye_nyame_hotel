import axios from 'axios';

const PAYSTACK_API = 'https://api.paystack.co';

export const initializePayment = async ({ email, amount }) => {
  try {
    const response = await axios.post(
      `${PAYSTACK_API}/transaction/initialize`,
      {
        email: email,
        amount: amount * 100,
      },
      {
        headers: {
          Authorization: `Bearer sk_test_d5308de3a5401eab5834446ffff1c0486e86dbe2`,
          'Contect-Type': 'application/json',
        },
      }
    );

    return response.data;
  } catch (err) {
    throw new Error(err.response?.data.message || 'Paystack init error');
  }
};

export const verifyPayment = async (reference) => {
  try {
    const response = await axios.get(
      `${PAYSTACK_API}/transaction/verify${reference}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRETE_KEY}`,
        },
      }
    );

    return response.data;
  } catch (err) {
    throw new Error(err.response?.data?.message || 'Paystack verify error');
  }
};
