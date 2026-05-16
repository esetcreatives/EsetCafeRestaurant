-- ============================================================
-- ESET Cafe & Restaurant — Hybrid Pay-First / Pay-Later Migration
-- ============================================================

-- 1. Add 'closed' to session_status enum if it doesn't exist yet
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'closed'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'session_status')
  ) THEN
    ALTER TYPE session_status ADD VALUE 'closed';
  END IF;
END $$;

-- 2. Add fulfillment_type to orders table
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS fulfillment_type TEXT NOT NULL DEFAULT 'pay_later'
  CHECK (fulfillment_type IN ('pay_first', 'pay_later'));

-- 3. Add session accounting columns
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS total_accumulated_bill NUMERIC NOT NULL DEFAULT 0;

ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS total_paid_amount NUMERIC NOT NULL DEFAULT 0;

-- 4. Replace the place_order RPC to support fulfillment_type
CREATE OR REPLACE FUNCTION place_order(
  p_session_id INTEGER,
  p_session_token TEXT DEFAULT '',
  p_items JSONB DEFAULT '[]',
  p_notes TEXT DEFAULT '',
  p_fulfillment_type TEXT DEFAULT 'pay_later'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_session RECORD;
  v_order_id INTEGER;
  v_item JSONB;
  v_menu_item RECORD;
  v_order_subtotal NUMERIC := 0;
  v_last_order_time TIMESTAMPTZ;
  v_item_count INTEGER := 0;
BEGIN
  -- 1. Validate session
  SELECT * INTO v_session FROM sessions WHERE id = p_session_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'SESSION_NOT_FOUND', 'message', 'Session not found');
  END IF;

  IF v_session.status != 'open' THEN
    RETURN jsonb_build_object('success', false, 'error', 'SESSION_CLOSED', 'message', 'Session is ' || v_session.status);
  END IF;

  -- 2. Validate session token (skip for service-role calls where token is empty)
  IF p_session_token != '' AND v_session.token != p_session_token THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_TOKEN', 'message', 'Invalid session token');
  END IF;

  -- 3. Rate limiting: max 1 order per 5 seconds per session
  SELECT MAX(placed_at) INTO v_last_order_time
  FROM orders WHERE session_id = p_session_id;

  IF v_last_order_time IS NOT NULL AND (NOW() - v_last_order_time) < INTERVAL '5 seconds' THEN
    RETURN jsonb_build_object('success', false, 'error', 'RATE_LIMITED', 'message', 'Please wait before placing another order');
  END IF;

  -- 4. Validate fulfillment_type
  IF p_fulfillment_type NOT IN ('pay_first', 'pay_later') THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_FULFILLMENT_TYPE', 'message', 'fulfillment_type must be pay_first or pay_later');
  END IF;

  -- 5. Create the order with fulfillment_type
  INSERT INTO orders (session_id, status, notes, fulfillment_type)
  VALUES (
    p_session_id,
    'pending'::order_status,
    p_notes,
    p_fulfillment_type
  )
  RETURNING id INTO v_order_id;

  -- 6. Process each item
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    SELECT * INTO v_menu_item
    FROM menu_items
    WHERE id = (v_item->>'menu_item_id')::INTEGER;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'error', 'ITEM_NOT_FOUND', 'message', 'Menu item not found: ' || (v_item->>'menu_item_id'));
    END IF;

    IF NOT v_menu_item.is_available THEN
      RETURN jsonb_build_object('success', false, 'error', 'ITEM_UNAVAILABLE', 'message', v_menu_item.name || ' is not available');
    END IF;

    -- Check stock
    IF v_menu_item.stock_quantity < (v_item->>'quantity')::INTEGER THEN
      RETURN jsonb_build_object('success', false, 'error', 'OUT_OF_STOCK', 'message', v_menu_item.name || ' only has ' || v_menu_item.stock_quantity || ' left');
    END IF;

    -- Insert order item
    INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price)
    VALUES (v_order_id, v_menu_item.id, (v_item->>'quantity')::INTEGER, v_menu_item.price);

    -- Decrement stock
    UPDATE menu_items
    SET stock_quantity = stock_quantity - (v_item->>'quantity')::INTEGER
    WHERE id = v_menu_item.id;

    v_order_subtotal := v_order_subtotal + (v_menu_item.price * (v_item->>'quantity')::INTEGER);
    v_item_count := v_item_count + (v_item->>'quantity')::INTEGER;
  END LOOP;

  -- 7. Update session accumulated bill (subtotal + VAT 15% + Service 10%)
  UPDATE sessions
  SET total_accumulated_bill = total_accumulated_bill + (v_order_subtotal * 1.25)
  WHERE id = p_session_id;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', v_order_id,
    'item_count', v_item_count,
    'subtotal', v_order_subtotal,
    'fulfillment_type', p_fulfillment_type,
    'message', CASE
      WHEN p_fulfillment_type = 'pay_later' THEN 'Order sent to kitchen'
      WHEN p_fulfillment_type = 'pay_first' THEN 'Order received — awaiting payment verification'
      ELSE 'Order placed'
    END
  );
END;
$$;

-- 5. Replace get_session_bill to include paid amounts
CREATE OR REPLACE FUNCTION get_session_bill(p_session_id INTEGER)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_subtotal NUMERIC := 0;
  v_vat NUMERIC := 0;
  v_service NUMERIC := 0;
  v_total NUMERIC := 0;
  v_total_paid NUMERIC := 0;
  v_remaining NUMERIC := 0;
BEGIN
  -- Calculate subtotal from all non-cancelled order items
  SELECT COALESCE(SUM(oi.unit_price * oi.quantity), 0)
  INTO v_subtotal
  FROM order_items oi
  JOIN orders o ON oi.order_id = o.id
  WHERE o.session_id = p_session_id
    AND o.status != 'cancelled';

  v_vat := v_subtotal * 0.15;
  v_service := v_subtotal * 0.10;
  v_total := v_subtotal + v_vat + v_service;

  -- Get total already paid from approved payments
  SELECT COALESCE(SUM(total), 0)
  INTO v_total_paid
  FROM payments
  WHERE session_id = p_session_id
    AND status = 'approved';

  v_remaining := v_total - v_total_paid;

  -- Sync session accounting columns
  UPDATE sessions
  SET total_accumulated_bill = v_total,
      total_paid_amount = v_total_paid
  WHERE id = p_session_id;

  RETURN jsonb_build_object(
    'subtotal', v_subtotal,
    'vat', v_vat,
    'service_charge', v_service,
    'total', v_total,
    'total_paid', v_total_paid,
    'remaining', v_remaining
  );
END;
$$;

-- 6. Grant execute permissions (same as existing RPCs)
GRANT EXECUTE ON FUNCTION place_order(INTEGER, TEXT, JSONB, TEXT, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_session_bill(INTEGER) TO anon, authenticated, service_role;
