// Native fetch is available in Node 24

async function testApi() {
  const url = "https://pay.foluxpay.io/api/partner/get_card?key=pk_fbe22845e665ebd46f99c78a9d9da3147a858560c8c77b8a";
  const payload = {
    amount: 100,
    currency: "PLN",
    client_id: "test_client",
    external_id: "test_external"
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const text = await res.text();
    console.log("Create Status:", res.status);
    console.log("Create Response:", text);
    
    if (res.status === 200) {
      const data = JSON.parse(text);
      if (data.order_id) {
         const statusUrl = `https://pay.foluxpay.io/api/partner/status?key=pk_fbe22845e665ebd46f99c78a9d9da3147a858560c8c77b8a&id=${data.order_id}`;
         const sRes = await fetch(statusUrl);
         console.log("Status Check Response:", await sRes.text());
      }
    }
  } catch(e) {
    console.error("Error:", e);
  }
}

testApi();
