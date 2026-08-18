ALTER TABLE `ebay_drafts` MODIFY COLUMN `offerId` varchar(64);--> statement-breakpoint
ALTER TABLE `listing_imports` MODIFY COLUMN `status` enum('review','draft submitted','draft processing','draft created','failed') NOT NULL DEFAULT 'review';--> statement-breakpoint
ALTER TABLE `ebay_drafts` ADD `workflow` enum('inventory_offer','seller_hub_feed') DEFAULT 'inventory_offer' NOT NULL;--> statement-breakpoint
ALTER TABLE `ebay_drafts` ADD `feedTaskId` varchar(128);--> statement-breakpoint
ALTER TABLE `ebay_drafts` ADD `feedStatus` varchar(48);--> statement-breakpoint
ALTER TABLE `ebay_drafts` ADD `feedSuccessCount` int;--> statement-breakpoint
ALTER TABLE `ebay_drafts` ADD `feedFailureCount` int;--> statement-breakpoint
ALTER TABLE `ebay_drafts` ADD `resultMessage` text;--> statement-breakpoint
ALTER TABLE `ebay_drafts` ADD CONSTRAINT `ebay_drafts_feed_task_unique` UNIQUE(`feedTaskId`);