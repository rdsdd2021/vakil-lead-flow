-- ===================================================================
-- Vakil Lead Flow CRM - Initial Seed Data for MySQL
-- Populates default firm advocates & staff accounts
-- ===================================================================

USE `vakil_lead_flow`;

INSERT INTO `users` (`id`, `name`, `email`, `phone`, `role`)
VALUES
  ('admin', 'Priya Sharma (Super Admin)', 'admin@vakiltech.com', '9800000001', 'super_admin'),
  ('frontdesk', 'Rahul Verma (Front Desk)', 'frontdesk@vakiltech.com', '9800000002', 'front_desk'),
  ('devika', 'Adv. Devika', 'devika@vakiltech.com', '9800000003', 'lawyer'),
  ('aaditya', 'Adv. Aaditya', 'aaditya@vakiltech.com', '9800000004', 'lawyer'),
  ('pritam', 'Adv. Pritam Banik', 'pritam@vakiltech.com', '9800000005', 'lawyer'),
  ('lawyer', 'Adv. Meera Patel', 'lawyer@vakiltech.com', '9800000006', 'lawyer')
ON DUPLICATE KEY UPDATE
  `name` = VALUES(`name`),
  `phone` = VALUES(`phone`),
  `role` = VALUES(`role`);
