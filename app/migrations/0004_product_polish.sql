ALTER TABLE trades ADD COLUMN counterparty TEXT;
ALTER TABLE trades ADD COLUMN traded_on TEXT;

CREATE INDEX collection_items_owner_status ON collection_items(user_id, own, for_trade, wishlist);
CREATE INDEX copies_owner_updated ON copies(user_id, active, updated_at DESC);
