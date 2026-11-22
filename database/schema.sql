-- ===================================================================
-- Vakil Lead Flow CRM - Comprehensive MySQL Database Schema
-- Version: 2.3.0
-- Compatible with: MySQL 5.7+, MySQL 8.0+, MariaDB 10.3+
-- ===================================================================

CREATE DATABASE IF NOT EXISTS `vakil_lead_flow`
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE `vakil_lead_flow`;

-- -------------------------------------------------------------------
-- 1. Table: users (Firm Staff, Advocates, Super Admins)
-- -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `users` (
  `id` VARCHAR(64) NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `email` VARCHAR(255) NOT NULL,
  `phone` VARCHAR(50) DEFAULT NULL,
  `role` ENUM('super_admin', 'front_desk', 'lawyer') NOT NULL DEFAULT 'front_desk',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_users_email` (`email`),
  KEY `idx_users_role` (`role`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------------------------------
-- 2. Table: leads (Inbound Leads & Client Inquiries)
-- -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `leads` (
  `id` VARCHAR(64) NOT NULL,
  `custom_id` VARCHAR(64) DEFAULT NULL,
  `name` VARCHAR(255) NOT NULL,
  `location` VARCHAR(255) DEFAULT '',
  `whatsapp_number` VARCHAR(50) NOT NULL,
  `phone` VARCHAR(50) DEFAULT NULL,
  `service` VARCHAR(100) DEFAULT 'consultation',
  `description` TEXT DEFAULT NULL,
  `payment_status` VARCHAR(50) DEFAULT 'pending',
  `status` VARCHAR(50) NOT NULL DEFAULT 'NEW_LEAD',
  `advance_amount` DECIMAL(12,2) DEFAULT 0.00,
  `mark_advance_paid` TINYINT(1) DEFAULT 0,
  `payment_amount` DECIMAL(12,2) DEFAULT 0.00,
  `payment_id` VARCHAR(255) DEFAULT NULL,
  `assigned_lawyer_id` VARCHAR(64) DEFAULT NULL,
  `lead_score` INT DEFAULT 50,
  `followup_count` INT DEFAULT 0,
  `followup_history` JSON DEFAULT NULL,
  `communication_notes` JSON DEFAULT NULL,
  `conversion_source` VARCHAR(50) DEFAULT 'website',
  `converted_at_followup` INT DEFAULT NULL,
  `converted_by` VARCHAR(64) DEFAULT NULL,
  `converted_at` DATETIME DEFAULT NULL,
  `last_called_by` VARCHAR(64) DEFAULT NULL,
  `last_called_at` DATETIME DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_leads_whatsapp` (`whatsapp_number`),
  KEY `idx_leads_phone` (`phone`),
  KEY `idx_leads_status` (`status`),
  KEY `idx_leads_assigned_lawyer` (`assigned_lawyer_id`),
  KEY `idx_leads_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------------------------------
-- 3. Table: tickets (Active Legal Matters & Case Files)
-- -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `tickets` (
  `ticket_id` VARCHAR(64) NOT NULL,
  `client_id` VARCHAR(64) NOT NULL,
  `client_name` VARCHAR(255) NOT NULL,
  `lawyer_id` VARCHAR(64) DEFAULT NULL,
  `lawyer_name` VARCHAR(255) DEFAULT NULL,
  `service_type` VARCHAR(100) DEFAULT 'consultation',
  `description` TEXT DEFAULT NULL,
  `status` VARCHAR(50) NOT NULL DEFAULT 'WORK_UNDER_PROCESS',
  `priority` VARCHAR(50) DEFAULT 'medium',
  `amount` DECIMAL(12,2) DEFAULT 0.00,
  `advance_paid` DECIMAL(12,2) DEFAULT 0.00,
  `followup_history` JSON DEFAULT NULL,
  `communication_notes` JSON DEFAULT NULL,
  `documents` JSON DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`ticket_id`),
  KEY `idx_tickets_client` (`client_id`),
  KEY `idx_tickets_lawyer` (`lawyer_id`),
  KEY `idx_tickets_status` (`status`),
  KEY `idx_tickets_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------------------------------
-- 4. Table: follow_ups (Scheduled Follow-up Reminders)
-- -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `follow_ups` (
  `id` VARCHAR(64) NOT NULL,
  `lead_id` VARCHAR(64) DEFAULT NULL,
  `ticket_id` VARCHAR(64) DEFAULT NULL,
  `scheduled_at` DATETIME NOT NULL,
  `status` VARCHAR(50) NOT NULL DEFAULT 'PENDING',
  `notes` TEXT DEFAULT NULL,
  `assigned_to` VARCHAR(64) DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_followups_scheduled` (`scheduled_at`),
  KEY `idx_followups_status` (`status`),
  KEY `idx_followups_assigned` (`assigned_to`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------------------------------
-- 5. Table: activity_logs (Audit Trail, Calls & Telephony Recordings)
-- -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `activity_logs` (
  `id` VARCHAR(64) NOT NULL,
  `entity_type` VARCHAR(50) NOT NULL DEFAULT 'lead',
  `entity_id` VARCHAR(64) NOT NULL,
  `action` VARCHAR(100) NOT NULL,
  `details` TEXT DEFAULT NULL,
  `call_duration` VARCHAR(50) DEFAULT NULL,
  `call_status` VARCHAR(50) DEFAULT NULL,
  `recording_url` VARCHAR(1024) DEFAULT NULL,
  `masked_number` VARCHAR(50) DEFAULT NULL,
  `created_by` VARCHAR(255) DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_activity_entity` (`entity_id`),
  KEY `idx_activity_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------------------------------
-- 6. Table: push_subscriptions (Browser Web Push Notifications)
-- -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `push_subscriptions` (
  `id` VARCHAR(64) NOT NULL,
  `user_id` VARCHAR(64) NOT NULL,
  `subscription` JSON NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_push_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
