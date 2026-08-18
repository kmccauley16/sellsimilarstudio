CREATE TABLE `ebay_connections` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`marketplaceId` varchar(24) NOT NULL DEFAULT 'EBAY_US',
	`environment` enum('sandbox','production') NOT NULL DEFAULT 'production',
	`ebayUserId` varchar(128),
	`accessTokenEncrypted` text NOT NULL,
	`refreshTokenEncrypted` text NOT NULL,
	`accessTokenExpiresAt` timestamp NOT NULL,
	`refreshTokenExpiresAt` timestamp,
	`scopes` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ebay_connections_id` PRIMARY KEY(`id`),
	CONSTRAINT `ebay_connections_user_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE TABLE `ebay_drafts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`listingImportId` int NOT NULL,
	`sku` varchar(50) NOT NULL,
	`offerId` varchar(64) NOT NULL,
	`marketplaceId` varchar(24) NOT NULL DEFAULT 'EBAY_US',
	`sellerHubUrl` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ebay_drafts_id` PRIMARY KEY(`id`),
	CONSTRAINT `ebay_drafts_import_unique` UNIQUE(`listingImportId`),
	CONSTRAINT `ebay_drafts_offer_unique` UNIQUE(`offerId`)
);
--> statement-breakpoint
CREATE TABLE `listing_imports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`sourceUrl` text NOT NULL,
	`sourceItemId` varchar(32) NOT NULL,
	`title` varchar(80) NOT NULL,
	`description` text NOT NULL,
	`itemSpecifics` text NOT NULL,
	`imageUrls` text NOT NULL,
	`selectedImageUrls` text NOT NULL,
	`conditionId` varchar(32),
	`conditionName` varchar(120),
	`price` decimal(12,2),
	`currency` varchar(3) NOT NULL DEFAULT 'USD',
	`categoryId` varchar(32),
	`categoryName` varchar(255),
	`quantity` int NOT NULL DEFAULT 1,
	`status` enum('review','draft created','failed') NOT NULL DEFAULT 'review',
	`errorMessage` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `listing_imports_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `ebay_connections` ADD CONSTRAINT `ebay_connections_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ebay_drafts` ADD CONSTRAINT `ebay_drafts_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ebay_drafts` ADD CONSTRAINT `ebay_drafts_listingImportId_listing_imports_id_fk` FOREIGN KEY (`listingImportId`) REFERENCES `listing_imports`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `listing_imports` ADD CONSTRAINT `listing_imports_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `listing_imports_user_created_idx` ON `listing_imports` (`userId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `listing_imports_source_item_idx` ON `listing_imports` (`sourceItemId`);