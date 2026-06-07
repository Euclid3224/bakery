"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { createBakeryServer } = require("../server");
const { createFileStore } = require("../lib/file-store");

const TEST_PASSWORD = "Admin-Test-123!";

async function startTestServer() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "bakery-test-"));
  await fs.writeFile(
    path.join(directory, "products.json"),
    JSON.stringify(
      [
        {
          id: "test-bread",
          category: "bread",
          name: "Test bread",
          description: "Fresh bread used by integration tests.",
          image: "assets/bakery-1.jfif",
          price: 100,
          stock: 5,
        },
      ],
      null,
      2
    )
  );
  await fs.writeFile(path.join(directory, "orders.json"), "[]\n");

  const store = createFileStore({ dataDirectory: directory });
  const server = createBakeryServer({
    store,
    adminUsername: "admin",
    adminPassword: TEST_PASSWORD,
    cookieSecure: false,
  });
  await server.ready;
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: async () => {
      await new Promise((resolve) => server.close(resolve));
      await fs.rm(directory, { recursive: true, force: true });
    },
  };
}

async function jsonRequest(url, options = {}) {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json", ...options.headers },
    ...options,
  });
  const body = await response.json();
  return { response, body };
}

async function login(baseUrl, password = TEST_PASSWORD) {
  const result = await jsonRequest(`${baseUrl}/api/auth/login`, {
    method: "POST",
    body: JSON.stringify({ username: "admin", password }),
  });
  return {
    ...result,
    cookie: result.response.headers.get("set-cookie")?.split(";")[0],
  };
}

test("pickup order reserves stock and cancellation restores it", async (context) => {
  const app = await startTestServer();
  context.after(app.close);

  const adminPage = await fetch(`${app.baseUrl}/admin`);
  assert.equal(adminPage.status, 200);

  const initial = await jsonRequest(`${app.baseUrl}/api/products`);
  assert.equal(initial.body[0].stock, 5);

  const unauthorized = await jsonRequest(
    `${app.baseUrl}/api/admin/products/test-bread`,
    {
      method: "PUT",
      body: JSON.stringify(initial.body[0]),
    }
  );
  assert.equal(unauthorized.response.status, 401);

  const auth = await login(app.baseUrl);
  assert.equal(auth.response.status, 200);

  const update = await jsonRequest(
    `${app.baseUrl}/api/admin/products/test-bread`,
    {
      method: "PUT",
      headers: { Cookie: auth.cookie },
      body: JSON.stringify({ ...initial.body[0], price: 125, stock: 7 }),
    }
  );
  assert.equal(update.body.stock, 7);

  const order = await jsonRequest(`${app.baseUrl}/api/orders`, {
    method: "POST",
    body: JSON.stringify({
      customer: {
        name: "Test customer",
        phone: "+7 900 000-00-00",
        pickupTime: "Today",
      },
      items: [{ productId: "test-bread", quantity: 2 }],
    }),
  });
  assert.equal(order.response.status, 201);
  assert.equal(order.body.total, 250);

  const productsAfterOrder = await jsonRequest(`${app.baseUrl}/api/products`);
  assert.equal(productsAfterOrder.body[0].stock, 5);

  const cancellation = await jsonRequest(
    `${app.baseUrl}/api/admin/orders/${encodeURIComponent(order.body.id)}/status`,
    {
      method: "PUT",
      headers: { Cookie: auth.cookie },
      body: JSON.stringify({ status: "cancelled" }),
    }
  );
  assert.equal(cancellation.body.status, "cancelled");

  const productsAfterCancellation = await jsonRequest(`${app.baseUrl}/api/products`);
  assert.equal(productsAfterCancellation.body[0].stock, 7);
});

test("admin product CRUD and ordering are persisted", async (context) => {
  const app = await startTestServer();
  context.after(app.close);
  const auth = await login(app.baseUrl);

  const create = await jsonRequest(`${app.baseUrl}/api/admin/products`, {
    method: "POST",
    headers: { Cookie: auth.cookie },
    body: JSON.stringify({
      category: "pastry",
      name: "New bun",
      description: "A product used to test creation and ordering.",
      image: "assets/bakery-2.jfif",
      price: 80,
      stock: 3,
    }),
  });
  assert.equal(create.response.status, 201);

  const reorder = await jsonRequest(`${app.baseUrl}/api/admin/products/order`, {
    method: "PUT",
    headers: { Cookie: auth.cookie },
    body: JSON.stringify({ productIds: [create.body.id, "test-bread"] }),
  });
  assert.deepEqual(
    reorder.body.map((product) => product.id),
    [create.body.id, "test-bread"]
  );

  const remove = await jsonRequest(
    `${app.baseUrl}/api/admin/products/${encodeURIComponent(create.body.id)}`,
    {
      method: "DELETE",
      headers: { Cookie: auth.cookie },
    }
  );
  assert.equal(remove.response.status, 200);
});

test("password change revokes sessions and replaces the old password", async (context) => {
  const app = await startTestServer();
  context.after(app.close);
  const auth = await login(app.baseUrl);
  const newPassword = "Changed-Admin-456!";

  const change = await jsonRequest(`${app.baseUrl}/api/auth/password`, {
    method: "PUT",
    headers: { Cookie: auth.cookie },
    body: JSON.stringify({
      currentPassword: TEST_PASSWORD,
      newPassword,
    }),
  });
  assert.equal(change.response.status, 200);

  const oldSession = await jsonRequest(`${app.baseUrl}/api/admin/orders`, {
    headers: { Cookie: auth.cookie },
  });
  assert.equal(oldSession.response.status, 401);

  const oldLogin = await login(app.baseUrl, TEST_PASSWORD);
  assert.equal(oldLogin.response.status, 401);

  const newLogin = await login(app.baseUrl, newPassword);
  assert.equal(newLogin.response.status, 200);
});

test("login is rate limited after repeated failures", async (context) => {
  const app = await startTestServer();
  context.after(app.close);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const failed = await login(app.baseUrl, "wrong-password");
    assert.equal(failed.response.status, 401);
  }

  const blocked = await login(app.baseUrl, TEST_PASSWORD);
  assert.equal(blocked.response.status, 429);
  assert.equal(blocked.response.headers.get("retry-after"), "900");
});
