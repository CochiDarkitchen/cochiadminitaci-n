-- ============================================================
-- COCHI ADMINISTRACIÓN — esquema de base de datos (Supabase/Postgres)
-- Ejecuta este script completo en Supabase → SQL Editor → New query → Run
-- ============================================================

create extension if not exists pgcrypto; -- por si gen_random_uuid() no está disponible aún

-- ---------- función reutilizable para updated_at ----------
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ============================================================
-- TABLA: providers (proveedores)
-- ============================================================
create table if not exists providers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  contact text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_providers_updated before update on providers
  for each row execute function set_updated_at();

-- ============================================================
-- TABLA: delivery_zones (zonas de delivery)
-- ============================================================
create table if not exists delivery_zones (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  cost numeric(12,2) not null default 0 check (cost >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_zones_updated before update on delivery_zones
  for each row execute function set_updated_at();

-- ============================================================
-- TABLA: config (fila única con la configuración del negocio)
-- ============================================================
create table if not exists config (
  id smallint primary key default 1,
  name text not null default 'COCHI',
  phone text,
  address text,
  exchange_rate numeric(12,4) not null default 1,
  updated_at timestamptz not null default now(),
  constraint config_singleton check (id = 1)
);
create trigger trg_config_updated before update on config
  for each row execute function set_updated_at();
insert into config (id, name, phone, address, exchange_rate)
  values (1, 'COCHI', '', '', 1)
  on conflict (id) do nothing;

-- ============================================================
-- TABLA: products (productos)
-- ============================================================
create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text,
  price numeric(12,2) not null default 0 check (price >= 0),
  stock integer, -- null = no se controla stock para este producto
  available boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_products_category on products(category);
create trigger trg_products_updated before update on products
  for each row execute function set_updated_at();

-- ============================================================
-- TABLA: customers (clientes)
-- ============================================================
create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  address text,
  address_2 text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_customers_name on customers(name);
create trigger trg_customers_updated before update on customers
  for each row execute function set_updated_at();

-- ============================================================
-- TABLA: orders (órdenes) — order_number vía secuencia (seguro entre dispositivos)
-- ============================================================
create sequence if not exists order_number_seq start 1001;

create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  order_number integer not null unique default nextval('order_number_seq'),
  customer_id uuid references customers(id),
  order_date timestamptz not null default now(),
  subtotal numeric(12,2) not null default 0,
  delivery_zone_id uuid references delivery_zones(id),
  delivery_cost numeric(12,2) not null default 0,
  discount numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  payment_method text,
  status text not null default 'pendiente'
    check (status in ('pendiente','preparacion','lista','delivery','completada','cancelada')),
  notes text,
  exchange_rate numeric(12,4) not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_orders_customer on orders(customer_id);
create index if not exists idx_orders_status on orders(status);
create index if not exists idx_orders_date on orders(order_date);
create trigger trg_orders_updated before update on orders
  for each row execute function set_updated_at();

-- ============================================================
-- TABLA: order_items (detalle de cada orden, con snapshot de nombre/precio)
-- ============================================================
create table if not exists order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  product_id uuid references products(id),
  product_name text not null,
  price numeric(12,2) not null,
  quantity integer not null check (quantity > 0),
  subtotal numeric(12,2) not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_items_order on order_items(order_id);
create index if not exists idx_items_product on order_items(product_id);

-- ============================================================
-- TABLA: expenses (gastos)
-- ============================================================
create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  expense_date date not null default current_date,
  category text not null,
  description text not null,
  provider_id uuid references providers(id) on delete set null,
  amount numeric(12,2) not null check (amount > 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_expenses_date on expenses(expense_date);
create index if not exists idx_expenses_provider on expenses(provider_id);
create trigger trg_expenses_updated before update on expenses
  for each row execute function set_updated_at();

-- ============================================================
-- RLS: activar en todas las tablas + política única
-- (un solo admin autenticado por ahora; listo para roles más adelante)
-- ============================================================
alter table products enable row level security;
alter table customers enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table expenses enable row level security;
alter table providers enable row level security;
alter table delivery_zones enable row level security;
alter table config enable row level security;

create policy "auth full access" on products for all using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "auth full access" on customers for all using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "auth full access" on orders for all using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "auth full access" on order_items for all using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "auth full access" on expenses for all using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "auth full access" on providers for all using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "auth full access" on delivery_zones for all using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "auth full access" on config for all using (auth.uid() is not null) with check (auth.uid() is not null);

-- ============================================================
-- FUNCIÓN: create_order — crea la orden completa en una sola transacción,
-- bloqueando los productos involucrados (FOR UPDATE) para que dos
-- dispositivos no puedan vender el mismo stock al mismo tiempo.
-- ============================================================
create or replace function create_order(
  p_customer_id uuid,
  p_items jsonb,              -- [{"product_id": "...", "quantity": 2}, ...]
  p_delivery_zone_id uuid,
  p_discount numeric,
  p_payment_method text,
  p_notes text,
  p_exchange_rate numeric
) returns table(id uuid, order_number integer) as $$
declare
  v_order_id uuid;
  v_order_number integer;
  v_subtotal numeric := 0;
  v_delivery numeric := 0;
  v_total numeric;
  v_item jsonb;
  v_product products%rowtype;
  v_qty integer;
begin
  if p_delivery_zone_id is not null then
    select cost into v_delivery from delivery_zones where id = p_delivery_zone_id;
  end if;

  -- primero: bloquear y validar todos los productos (orden fijo evita deadlocks)
  for v_item in select * from jsonb_array_elements(p_items) order by (value->>'product_id')
  loop
    v_qty := (v_item->>'quantity')::integer;
    select * into v_product from products where id = (v_item->>'product_id')::uuid for update;
    if not found then
      raise exception 'Producto no encontrado';
    end if;
    if v_product.stock is not null and v_product.stock < v_qty then
      raise exception 'Stock insuficiente para %', v_product.name;
    end if;
    v_subtotal := v_subtotal + (v_product.price * v_qty);
  end loop;

  v_total := v_subtotal + coalesce(v_delivery,0) - coalesce(p_discount,0);

  insert into orders(customer_id, delivery_zone_id, subtotal, delivery_cost, discount, total, payment_method, notes, exchange_rate)
  values (p_customer_id, p_delivery_zone_id, v_subtotal, coalesce(v_delivery,0), coalesce(p_discount,0), v_total, p_payment_method, p_notes, p_exchange_rate)
  returning id, order_number into v_order_id, v_order_number;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_qty := (v_item->>'quantity')::integer;
    select * into v_product from products where id = (v_item->>'product_id')::uuid;
    insert into order_items(order_id, product_id, product_name, price, quantity, subtotal)
    values (v_order_id, v_product.id, v_product.name, v_product.price, v_qty, v_product.price * v_qty);
    if v_product.stock is not null then
      update products set stock = stock - v_qty where id = v_product.id;
    end if;
  end loop;

  return query select v_order_id, v_order_number;
end;
$$ language plpgsql security invoker;

grant execute on function create_order(uuid, jsonb, uuid, numeric, text, text, numeric) to authenticated;
revoke execute on function create_order(uuid, jsonb, uuid, numeric, text, text, numeric) from anon;

-- ============================================================
-- TRIGGER: al cancelar una orden, devolver el stock de sus productos
-- ============================================================
create or replace function restore_stock_on_cancel() returns trigger as $$
begin
  if new.status = 'cancelada' and old.status <> 'cancelada' then
    update products p set stock = p.stock + oi.quantity
    from order_items oi
    where oi.order_id = new.id and oi.product_id = p.id and p.stock is not null;
  end if;
  return new;
end;
$$ language plpgsql security invoker;

create trigger trg_restore_stock after update of status on orders
  for each row execute function restore_stock_on_cancel();

-- ============================================================
-- Fin del script. Siguiente paso: crea tu usuario administrador en
-- Authentication → Users (ver GUIA-INSTALACION.md).
-- ============================================================
