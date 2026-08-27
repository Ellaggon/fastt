-- Pets and smoking are contractual guest rules, not selectable services.
DELETE FROM "ProductServiceAttribute"
WHERE "productServiceId" IN (
	SELECT "id"
	FROM "ProductService"
	WHERE "serviceId" IN ('pet-friendly', 'smoking-rooms', 'nonsmoking')
);

DELETE FROM "ProductService"
WHERE "serviceId" IN ('pet-friendly', 'smoking-rooms', 'nonsmoking');

DELETE FROM "Service"
WHERE "id" IN ('pet-friendly', 'smoking-rooms', 'nonsmoking');
