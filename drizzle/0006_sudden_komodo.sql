ALTER TABLE `listing_imports` ADD `ownedImageUrls` varchar(8192) DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `listing_imports` ADD `photoRightsAttestedAt` timestamp;--> statement-breakpoint
ALTER TABLE `listing_imports` ADD `itemAccuracyAttestedAt` timestamp;