-- DEV SAMPLE DATA ONLY (fictional)
INSERT INTO wards (code, slug, name, hospital_name) VALUES ('WA', 'ward-a', 'หอผู้ป่วยอายุรกรรมชาย 1', 'โรงพยาบาลตัวอย่าง');
INSERT INTO ward_bank_accounts (ward_id, bank_name, account_name, account_no)
  SELECT id, 'ธนาคารกรุงไทย', 'หอผู้ป่วยอายุรกรรมชาย 1 (ตัวอย่าง)', '123-4-56789-0' FROM wards WHERE slug='ward-a';
INSERT INTO expense_categories (name, requires_approval) VALUES
  ('ชุดอาบน้ำและของใช้ส่วนตัว', false), ('ขนมและอาหาร', false), ('ของใช้จำเป็นสำหรับผู้ป่วย', false),
  ('ค่าเสียหายทรัพย์สิน', true), ('ค่าใช้จ่ายอื่น ๆ', false);
