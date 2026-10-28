CREATE TABLE `chat_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`room` text NOT NULL,
	`name` text NOT NULL,
	`text` text NOT NULL,
	`client_id` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `chat_room_created_idx` ON `chat_messages` (`room`,`created_at`);--> statement-breakpoint
CREATE INDEX `chat_client_created_idx` ON `chat_messages` (`client_id`,`created_at`);