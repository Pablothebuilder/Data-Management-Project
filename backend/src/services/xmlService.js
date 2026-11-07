// Builds the XML document for a grocery list. The document validates against
// frontend/public/schemas/grocery-list.xsd (served at /schemas/grocery-list.xsd).
function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

const money = (n) => Number(n).toFixed(2);

function groceryListToXml(list, baseUrl) {
  const created = list.created_at instanceof Date ? list.created_at.toISOString() : new Date(list.created_at).toISOString();
  const items = list.items.map((it) => `    <item id="${it.item_id}" purchased="${it.is_purchased}">
      <ingredient id="${it.ingredient_id}">${esc(it.name)}</ingredient>
      <category>${esc(it.category)}</category>
      <quantity unit="${esc(it.unit)}">${Number(it.quantity_to_buy)}</quantity>
      <unitPrice currency="CAD">${money(it.estimated_unit_price)}</unitPrice>
      <lineTotal currency="CAD">${money(it.line_total)}</lineTotal>
    </item>`).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<groceryList xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
             xsi:noNamespaceSchemaLocation="${baseUrl}/schemas/grocery-list.xsd"
             id="${list.list_id}" status="${esc(list.status)}">
  <owner id="${list.user_id}">${esc(list.user_name)}</owner>
  <createdAt>${created}</createdAt>
  <budget currency="CAD">${money(list.max_budget)}</budget>
  <items count="${list.items.length}">
${items}
  </items>
  <summary>
    <estimatedTotal currency="CAD">${money(list.estimated_total)}</estimatedTotal>
    <purchasedTotal currency="CAD">${money(list.purchased_total)}</purchasedTotal>
    <remainingBudget currency="CAD">${money(list.remaining_budget)}</remainingBudget>
    <overBudget>${list.over_budget}</overBudget>
  </summary>
</groceryList>
`;
}

module.exports = { groceryListToXml };
