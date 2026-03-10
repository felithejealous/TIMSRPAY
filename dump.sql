--
-- PostgreSQL database dump
--

\restrict dLd0qjx0Rc4mqVvwIQNcZ6BTcTGAB6jtdXJZ0Wc6mTR3FjQhah0zBefdr248cSs

-- Dumped from database version 18.1
-- Dumped by pg_dump version 18.1

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: add_on_recipes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.add_on_recipes (
    id integer NOT NULL,
    add_on_id integer NOT NULL,
    inventory_master_id integer NOT NULL,
    qty_used numeric(12,4) DEFAULT 1 NOT NULL
);


ALTER TABLE public.add_on_recipes OWNER TO postgres;

--
-- Name: add_on_recipes_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.add_on_recipes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.add_on_recipes_id_seq OWNER TO postgres;

--
-- Name: add_on_recipes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.add_on_recipes_id_seq OWNED BY public.add_on_recipes.id;


--
-- Name: add_ons; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.add_ons (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    addon_type character varying(20) DEFAULT 'ADDON'::character varying NOT NULL,
    price numeric(10,2) DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.add_ons OWNER TO postgres;

--
-- Name: add_ons_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.add_ons_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.add_ons_id_seq OWNER TO postgres;

--
-- Name: add_ons_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.add_ons_id_seq OWNED BY public.add_ons.id;


--
-- Name: addons; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.addons (
    id integer NOT NULL,
    name character varying(150) NOT NULL,
    price numeric(12,2) NOT NULL,
    is_active boolean DEFAULT true
);


ALTER TABLE public.addons OWNER TO postgres;

--
-- Name: addons_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.addons_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.addons_id_seq OWNER TO postgres;

--
-- Name: addons_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.addons_id_seq OWNED BY public.addons.id;


--
-- Name: alembic_version; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.alembic_version (
    version_num character varying(32) NOT NULL
);


ALTER TABLE public.alembic_version OWNER TO postgres;

--
-- Name: announcements; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.announcements (
    id integer NOT NULL,
    title character varying(150) NOT NULL,
    body text NOT NULL,
    image_url text,
    status character varying(20) DEFAULT 'draft'::character varying NOT NULL,
    is_pinned boolean DEFAULT false NOT NULL,
    publish_at timestamp with time zone,
    expire_at timestamp with time zone,
    created_by_user_id integer,
    updated_by_user_id integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone
);


ALTER TABLE public.announcements OWNER TO postgres;

--
-- Name: announcements_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.announcements_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.announcements_id_seq OWNER TO postgres;

--
-- Name: announcements_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.announcements_id_seq OWNED BY public.announcements.id;


--
-- Name: attendance_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.attendance_logs (
    id integer NOT NULL,
    staff_id integer,
    time_in timestamp without time zone,
    time_out timestamp without time zone
);


ALTER TABLE public.attendance_logs OWNER TO postgres;

--
-- Name: attendance_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.attendance_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.attendance_logs_id_seq OWNER TO postgres;

--
-- Name: attendance_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.attendance_logs_id_seq OWNED BY public.attendance_logs.id;


--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.audit_logs (
    id integer NOT NULL,
    user_id integer,
    action text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.audit_logs OWNER TO postgres;

--
-- Name: audit_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.audit_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.audit_logs_id_seq OWNER TO postgres;

--
-- Name: audit_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.audit_logs_id_seq OWNED BY public.audit_logs.id;


--
-- Name: categories; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.categories (
    id integer NOT NULL,
    name character varying(100) NOT NULL
);


ALTER TABLE public.categories OWNER TO postgres;

--
-- Name: categories_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.categories_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.categories_id_seq OWNER TO postgres;

--
-- Name: categories_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.categories_id_seq OWNED BY public.categories.id;


--
-- Name: customer_profiles; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.customer_profiles (
    user_id integer NOT NULL,
    full_name character varying(150),
    phone character varying(20)
);


ALTER TABLE public.customer_profiles OWNER TO postgres;

--
-- Name: inventory_items; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.inventory_items (
    id integer NOT NULL,
    product_id integer,
    quantity integer NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.inventory_items OWNER TO postgres;

--
-- Name: inventory_items_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.inventory_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.inventory_items_id_seq OWNER TO postgres;

--
-- Name: inventory_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.inventory_items_id_seq OWNED BY public.inventory_items.id;


--
-- Name: inventory_master; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.inventory_master (
    id integer NOT NULL,
    name character varying(150) NOT NULL,
    unit character varying(20) DEFAULT 'pcs'::character varying NOT NULL,
    quantity numeric(12,2) DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.inventory_master OWNER TO postgres;

--
-- Name: inventory_master_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.inventory_master_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.inventory_master_id_seq OWNER TO postgres;

--
-- Name: inventory_master_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.inventory_master_id_seq OWNED BY public.inventory_master.id;


--
-- Name: inventory_master_movements; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.inventory_master_movements (
    id integer NOT NULL,
    inventory_master_id integer NOT NULL,
    change_qty numeric(12,4) NOT NULL,
    reason character varying(50) NOT NULL,
    ref_order_id integer,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.inventory_master_movements OWNER TO postgres;

--
-- Name: inventory_master_movements_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.inventory_master_movements_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.inventory_master_movements_id_seq OWNER TO postgres;

--
-- Name: inventory_master_movements_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.inventory_master_movements_id_seq OWNED BY public.inventory_master_movements.id;


--
-- Name: order_item_add_ons; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.order_item_add_ons (
    id integer NOT NULL,
    order_item_id integer NOT NULL,
    add_on_id integer NOT NULL,
    qty integer DEFAULT 1 NOT NULL,
    price_at_time numeric(10,2) DEFAULT 0 NOT NULL
);


ALTER TABLE public.order_item_add_ons OWNER TO postgres;

--
-- Name: order_item_add_ons_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.order_item_add_ons_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.order_item_add_ons_id_seq OWNER TO postgres;

--
-- Name: order_item_add_ons_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.order_item_add_ons_id_seq OWNED BY public.order_item_add_ons.id;


--
-- Name: order_item_addons; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.order_item_addons (
    id integer NOT NULL,
    order_item_id integer NOT NULL,
    addon_id integer NOT NULL,
    quantity integer DEFAULT 1 NOT NULL,
    unit_price numeric(12,2) NOT NULL
);


ALTER TABLE public.order_item_addons OWNER TO postgres;

--
-- Name: order_item_addons_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.order_item_addons_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.order_item_addons_id_seq OWNER TO postgres;

--
-- Name: order_item_addons_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.order_item_addons_id_seq OWNED BY public.order_item_addons.id;


--
-- Name: order_item_customizations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.order_item_customizations (
    id integer NOT NULL,
    order_item_id integer NOT NULL,
    size_option_id integer,
    sugar_level_id integer
);


ALTER TABLE public.order_item_customizations OWNER TO postgres;

--
-- Name: order_item_customizations_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.order_item_customizations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.order_item_customizations_id_seq OWNER TO postgres;

--
-- Name: order_item_customizations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.order_item_customizations_id_seq OWNED BY public.order_item_customizations.id;


--
-- Name: order_items; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.order_items (
    id integer NOT NULL,
    order_id integer,
    product_id integer,
    quantity integer NOT NULL,
    price numeric(10,2) NOT NULL,
    size character varying(10),
    sugar_level character varying(10),
    size_extra numeric(12,2) DEFAULT 0
);


ALTER TABLE public.order_items OWNER TO postgres;

--
-- Name: order_items_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.order_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.order_items_id_seq OWNER TO postgres;

--
-- Name: order_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.order_items_id_seq OWNED BY public.order_items.id;


--
-- Name: orders; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.orders (
    id integer NOT NULL,
    user_id integer,
    order_type character varying(20),
    status character varying(30),
    total_amount numeric(10,2),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    subtotal numeric(12,2),
    vat_amount numeric(12,2),
    vat_rate numeric(5,2) DEFAULT 12.00,
    earned_points integer DEFAULT 0 NOT NULL,
    points_synced boolean DEFAULT false NOT NULL,
    points_claim_expires_at timestamp without time zone,
    points_claimed_at timestamp without time zone,
    points_claimed_user_id integer,
    points_claimed_by_staff_id integer,
    points_claim_method character varying(20)
);


ALTER TABLE public.orders OWNER TO postgres;

--
-- Name: orders_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.orders_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.orders_id_seq OWNER TO postgres;

--
-- Name: orders_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.orders_id_seq OWNED BY public.orders.id;


--
-- Name: password_reset_tokens; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.password_reset_tokens (
    id integer NOT NULL,
    user_id integer NOT NULL,
    token_hash character varying(128) NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone,
    is_used boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    attempts integer DEFAULT 0 NOT NULL
);


ALTER TABLE public.password_reset_tokens OWNER TO postgres;

--
-- Name: password_reset_tokens_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.password_reset_tokens_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.password_reset_tokens_id_seq OWNER TO postgres;

--
-- Name: password_reset_tokens_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.password_reset_tokens_id_seq OWNED BY public.password_reset_tokens.id;


--
-- Name: payments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.payments (
    id integer NOT NULL,
    order_id integer,
    method character varying(30),
    status character varying(30),
    paid_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.payments OWNER TO postgres;

--
-- Name: payments_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.payments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.payments_id_seq OWNER TO postgres;

--
-- Name: payments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.payments_id_seq OWNED BY public.payments.id;


--
-- Name: product_recipe; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.product_recipe (
    id integer NOT NULL,
    product_id integer NOT NULL,
    inventory_master_id integer NOT NULL,
    qty_used numeric(12,2) NOT NULL
);


ALTER TABLE public.product_recipe OWNER TO postgres;

--
-- Name: product_recipe_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.product_recipe_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.product_recipe_id_seq OWNER TO postgres;

--
-- Name: product_recipe_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.product_recipe_id_seq OWNED BY public.product_recipe.id;


--
-- Name: products; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.products (
    id integer NOT NULL,
    category_id integer,
    name character varying(150) NOT NULL,
    price numeric(10,2) NOT NULL,
    is_active boolean DEFAULT true,
    points_per_unit integer DEFAULT 0 NOT NULL,
    is_available boolean DEFAULT true NOT NULL,
    CONSTRAINT chk_points_per_unit_nonneg CHECK ((points_per_unit >= 0))
);


ALTER TABLE public.products OWNER TO postgres;

--
-- Name: products_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.products_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.products_id_seq OWNER TO postgres;

--
-- Name: products_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.products_id_seq OWNED BY public.products.id;


--
-- Name: qr_redemptions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.qr_redemptions (
    id integer NOT NULL,
    user_id integer,
    reward_id integer,
    qr_token text,
    is_used boolean DEFAULT false,
    expires_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.qr_redemptions OWNER TO postgres;

--
-- Name: qr_redemptions_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.qr_redemptions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.qr_redemptions_id_seq OWNER TO postgres;

--
-- Name: qr_redemptions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.qr_redemptions_id_seq OWNED BY public.qr_redemptions.id;


--
-- Name: reward_manual_otp; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.reward_manual_otp (
    id integer NOT NULL,
    user_id integer NOT NULL,
    otp_hash text NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    is_used boolean DEFAULT false NOT NULL,
    used_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    attempt_count integer DEFAULT 0 NOT NULL,
    last_attempt_at timestamp without time zone
);


ALTER TABLE public.reward_manual_otp OWNER TO postgres;

--
-- Name: reward_manual_otp_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.reward_manual_otp_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.reward_manual_otp_id_seq OWNER TO postgres;

--
-- Name: reward_manual_otp_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.reward_manual_otp_id_seq OWNED BY public.reward_manual_otp.id;


--
-- Name: reward_transactions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.reward_transactions (
    id integer NOT NULL,
    reward_wallet_id integer,
    reward_id integer,
    points_change integer,
    transaction_type character varying(20),
    order_id integer,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.reward_transactions OWNER TO postgres;

--
-- Name: reward_transactions_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.reward_transactions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.reward_transactions_id_seq OWNER TO postgres;

--
-- Name: reward_transactions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.reward_transactions_id_seq OWNED BY public.reward_transactions.id;


--
-- Name: reward_wallets; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.reward_wallets (
    id integer NOT NULL,
    user_id integer,
    total_points integer DEFAULT 0
);


ALTER TABLE public.reward_wallets OWNER TO postgres;

--
-- Name: reward_wallets_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.reward_wallets_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.reward_wallets_id_seq OWNER TO postgres;

--
-- Name: reward_wallets_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.reward_wallets_id_seq OWNED BY public.reward_wallets.id;


--
-- Name: rewards; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.rewards (
    id integer NOT NULL,
    name character varying(150),
    points_required integer,
    is_active boolean DEFAULT true
);


ALTER TABLE public.rewards OWNER TO postgres;

--
-- Name: rewards_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.rewards_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.rewards_id_seq OWNER TO postgres;

--
-- Name: rewards_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.rewards_id_seq OWNED BY public.rewards.id;


--
-- Name: roles; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.roles (
    id integer NOT NULL,
    name character varying(50) NOT NULL
);


ALTER TABLE public.roles OWNER TO postgres;

--
-- Name: roles_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.roles_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.roles_id_seq OWNER TO postgres;

--
-- Name: roles_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.roles_id_seq OWNED BY public.roles.id;


--
-- Name: size_options; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.size_options (
    id integer NOT NULL,
    name character varying(50) NOT NULL,
    price_add numeric(12,2) DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true
);


ALTER TABLE public.size_options OWNER TO postgres;

--
-- Name: size_options_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.size_options_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.size_options_id_seq OWNER TO postgres;

--
-- Name: size_options_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.size_options_id_seq OWNED BY public.size_options.id;


--
-- Name: staff_profiles; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.staff_profiles (
    user_id integer NOT NULL,
    full_name character varying(150),
    "position" character varying(100)
);


ALTER TABLE public.staff_profiles OWNER TO postgres;

--
-- Name: stock_movements; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.stock_movements (
    id integer NOT NULL,
    inventory_item_id integer,
    change_qty integer NOT NULL,
    reason character varying(100),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.stock_movements OWNER TO postgres;

--
-- Name: stock_movements_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.stock_movements_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.stock_movements_id_seq OWNER TO postgres;

--
-- Name: stock_movements_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.stock_movements_id_seq OWNED BY public.stock_movements.id;


--
-- Name: sugar_levels; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.sugar_levels (
    id integer NOT NULL,
    label character varying(20) NOT NULL,
    is_active boolean DEFAULT true
);


ALTER TABLE public.sugar_levels OWNER TO postgres;

--
-- Name: sugar_levels_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.sugar_levels_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.sugar_levels_id_seq OWNER TO postgres;

--
-- Name: sugar_levels_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.sugar_levels_id_seq OWNED BY public.sugar_levels.id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.users (
    id integer NOT NULL,
    email character varying(150),
    password_hash text,
    role_id integer,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    google_id character varying(100),
    oauth_provider character varying(50),
    profile_picture text
);


ALTER TABLE public.users OWNER TO postgres;

--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.users_id_seq OWNER TO postgres;

--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: wallet_transactions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.wallet_transactions (
    id integer NOT NULL,
    wallet_id integer,
    order_id integer,
    amount numeric(10,2),
    transaction_type character varying(20),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.wallet_transactions OWNER TO postgres;

--
-- Name: wallet_transactions_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.wallet_transactions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.wallet_transactions_id_seq OWNER TO postgres;

--
-- Name: wallet_transactions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.wallet_transactions_id_seq OWNED BY public.wallet_transactions.id;


--
-- Name: wallets; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.wallets (
    id integer NOT NULL,
    user_id integer,
    balance numeric(12,2) DEFAULT 0,
    pin_hash text
);


ALTER TABLE public.wallets OWNER TO postgres;

--
-- Name: wallets_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.wallets_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.wallets_id_seq OWNER TO postgres;

--
-- Name: wallets_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.wallets_id_seq OWNED BY public.wallets.id;


--
-- Name: add_on_recipes id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.add_on_recipes ALTER COLUMN id SET DEFAULT nextval('public.add_on_recipes_id_seq'::regclass);


--
-- Name: add_ons id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.add_ons ALTER COLUMN id SET DEFAULT nextval('public.add_ons_id_seq'::regclass);


--
-- Name: addons id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.addons ALTER COLUMN id SET DEFAULT nextval('public.addons_id_seq'::regclass);


--
-- Name: announcements id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.announcements ALTER COLUMN id SET DEFAULT nextval('public.announcements_id_seq'::regclass);


--
-- Name: attendance_logs id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.attendance_logs ALTER COLUMN id SET DEFAULT nextval('public.attendance_logs_id_seq'::regclass);


--
-- Name: audit_logs id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.audit_logs ALTER COLUMN id SET DEFAULT nextval('public.audit_logs_id_seq'::regclass);


--
-- Name: categories id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.categories ALTER COLUMN id SET DEFAULT nextval('public.categories_id_seq'::regclass);


--
-- Name: inventory_items id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.inventory_items ALTER COLUMN id SET DEFAULT nextval('public.inventory_items_id_seq'::regclass);


--
-- Name: inventory_master id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.inventory_master ALTER COLUMN id SET DEFAULT nextval('public.inventory_master_id_seq'::regclass);


--
-- Name: inventory_master_movements id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.inventory_master_movements ALTER COLUMN id SET DEFAULT nextval('public.inventory_master_movements_id_seq'::regclass);


--
-- Name: order_item_add_ons id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.order_item_add_ons ALTER COLUMN id SET DEFAULT nextval('public.order_item_add_ons_id_seq'::regclass);


--
-- Name: order_item_addons id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.order_item_addons ALTER COLUMN id SET DEFAULT nextval('public.order_item_addons_id_seq'::regclass);


--
-- Name: order_item_customizations id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.order_item_customizations ALTER COLUMN id SET DEFAULT nextval('public.order_item_customizations_id_seq'::regclass);


--
-- Name: order_items id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.order_items ALTER COLUMN id SET DEFAULT nextval('public.order_items_id_seq'::regclass);


--
-- Name: orders id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.orders ALTER COLUMN id SET DEFAULT nextval('public.orders_id_seq'::regclass);


--
-- Name: password_reset_tokens id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.password_reset_tokens ALTER COLUMN id SET DEFAULT nextval('public.password_reset_tokens_id_seq'::regclass);


--
-- Name: payments id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payments ALTER COLUMN id SET DEFAULT nextval('public.payments_id_seq'::regclass);


--
-- Name: product_recipe id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.product_recipe ALTER COLUMN id SET DEFAULT nextval('public.product_recipe_id_seq'::regclass);


--
-- Name: products id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.products ALTER COLUMN id SET DEFAULT nextval('public.products_id_seq'::regclass);


--
-- Name: qr_redemptions id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.qr_redemptions ALTER COLUMN id SET DEFAULT nextval('public.qr_redemptions_id_seq'::regclass);


--
-- Name: reward_manual_otp id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reward_manual_otp ALTER COLUMN id SET DEFAULT nextval('public.reward_manual_otp_id_seq'::regclass);


--
-- Name: reward_transactions id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reward_transactions ALTER COLUMN id SET DEFAULT nextval('public.reward_transactions_id_seq'::regclass);


--
-- Name: reward_wallets id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reward_wallets ALTER COLUMN id SET DEFAULT nextval('public.reward_wallets_id_seq'::regclass);


--
-- Name: rewards id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.rewards ALTER COLUMN id SET DEFAULT nextval('public.rewards_id_seq'::regclass);


--
-- Name: roles id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.roles ALTER COLUMN id SET DEFAULT nextval('public.roles_id_seq'::regclass);


--
-- Name: size_options id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.size_options ALTER COLUMN id SET DEFAULT nextval('public.size_options_id_seq'::regclass);


--
-- Name: stock_movements id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.stock_movements ALTER COLUMN id SET DEFAULT nextval('public.stock_movements_id_seq'::regclass);


--
-- Name: sugar_levels id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sugar_levels ALTER COLUMN id SET DEFAULT nextval('public.sugar_levels_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Name: wallet_transactions id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.wallet_transactions ALTER COLUMN id SET DEFAULT nextval('public.wallet_transactions_id_seq'::regclass);


--
-- Name: wallets id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.wallets ALTER COLUMN id SET DEFAULT nextval('public.wallets_id_seq'::regclass);


--
-- Data for Name: add_on_recipes; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.add_on_recipes (id, add_on_id, inventory_master_id, qty_used) FROM stdin;
7	4	3	30.0000
8	5	4	20.0000
9	6	5	1.0000
10	7	6	15.0000
\.


--
-- Data for Name: add_ons; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.add_ons (id, name, addon_type, price, is_active, created_at) FROM stdin;
1	Small	SIZE	0.00	t	2026-01-25 03:25:20.117697
2	Medium	SIZE	10.00	t	2026-01-25 03:25:20.117697
3	Large	SIZE	20.00	t	2026-01-25 03:25:20.117697
4	Pearls	ADDON	10.00	t	2026-01-25 03:25:20.117697
5	Crystals	ADDON	20.00	t	2026-01-25 03:25:20.117697
6	Ice Cream	ADDON	20.00	t	2026-01-25 03:25:20.117697
7	Graham	ADDON	20.00	t	2026-01-25 03:25:20.117697
11	Extra Pearl	ADDON	10.00	t	2026-01-25 19:56:27.390928
12	Extra Cream	ADDON	10.00	t	2026-01-25 19:56:27.390928
13	Extra Cheese	ADDON	10.00	t	2026-01-25 19:56:27.390928
\.


--
-- Data for Name: addons; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.addons (id, name, price, is_active) FROM stdin;
1	Pearls	10.00	t
2	Crystals	20.00	t
3	Ice Cream	20.00	t
4	Graham	20.00	t
\.


--
-- Data for Name: alembic_version; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.alembic_version (version_num) FROM stdin;
235d2ffb9101
\.


--
-- Data for Name: announcements; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.announcements (id, title, body, image_url, status, is_pinned, publish_at, expire_at, created_by_user_id, updated_by_user_id, created_at, updated_at) FROM stdin;
2	BADING AKO	As neptune enters the orbit of earth	\N	draft	t	2026-09-02 00:00:00+08	\N	12	12	2026-02-09 19:18:28.999996+08	\N
1	Bading	Today is bading day, buy 1 and get 1 free with your shbulis	\N	published	t	2026-02-09 00:00:00+08	2026-02-18 00:00:00+08	12	12	2026-02-09 19:17:44.342685+08	2026-02-09 19:34:07.466786+08
\.


--
-- Data for Name: attendance_logs; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.attendance_logs (id, staff_id, time_in, time_out) FROM stdin;
1	1	2026-02-01 22:55:42.976739	2026-02-01 22:55:59.423959
\.


--
-- Data for Name: audit_logs; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.audit_logs (id, user_id, action, created_at) FROM stdin;
\.


--
-- Data for Name: categories; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.categories (id, name) FROM stdin;
1	Drinks
\.


--
-- Data for Name: customer_profiles; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.customer_profiles (user_id, full_name, phone) FROM stdin;
\.


--
-- Data for Name: inventory_items; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.inventory_items (id, product_id, quantity, updated_at) FROM stdin;
4	8	50	2026-01-25 01:10:26.528442
5	6	50	2026-01-25 01:10:26.528442
8	7	50	2026-01-25 01:10:26.528442
1	1	50	2026-01-24 02:30:03.418993
2	2	50	2026-01-25 00:02:24.824556
7	3	36	2026-01-26 11:25:46.326415
6	4	7	2026-01-27 13:20:50.30093
3	5	6	2026-01-30 18:57:11.449486
\.


--
-- Data for Name: inventory_master; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.inventory_master (id, name, unit, quantity, is_active, updated_at) FROM stdin;
1	Cup	pcs	125.00	f	2026-01-30 18:57:11.449486
18	Condense milk	ml	1000.00	f	2026-01-31 18:59:56.495402
16	Fresh buko meat	g	1000.00	t	2026-01-31 18:59:37.337776
6	Graham	grams	5000.00	t	2026-01-26 00:20:33.740578
3	Pearls	grams	4730.00	t	2026-01-26 11:25:46.326415
21	Ripe avocado	pcs	999.00	t	2026-02-01 01:27:46.239177
12	Vanilla Ice Cream	g	26200.00	t	2026-02-04 00:08:49.043348
13	Sugar syrup	ml	80.00	t	2026-02-04 00:08:49.043348
14	Fresh mango	pcs	957.00	t	2026-02-04 00:08:49.043348
2	Straw	pcs	940.00	t	2026-02-08 02:22:43.298075
7	Fresh milk	ml	89600.00	t	2026-02-08 02:22:43.298075
8	Condensed milk	ml	1710.00	t	2026-02-08 02:22:43.298075
9	Cup-small	pcs	939.00	t	2026-02-08 02:22:43.298075
19	Ube halaya	g	220.00	t	2026-02-08 02:22:43.298075
20	Ube ice cream	g	89700.00	t	2026-02-08 02:22:43.298075
4	Crystals	grams	4147.00	t	2026-02-09 22:23:52.6301
15	Strawberry	pcs	972.00	t	2026-02-02 16:09:44.430761
5	Ice Cream	scoops	1190.00	t	2026-01-31 18:56:45.354543
10	Cup-medium	pcs	1000.00	t	2026-01-31 18:58:17.817439
11	Cup-large	pcs	1000.00	t	2026-01-31 18:58:26.469236
17	Buko juice	ml	1000.00	t	2026-01-31 18:59:51.089554
22	Fresh lychee	pcs	1000.00	t	2026-01-31 19:00:44.790732
23	Lychee syrup	ml	1000.00	t	2026-01-31 19:00:48.699484
\.


--
-- Data for Name: inventory_master_movements; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.inventory_master_movements (id, inventory_master_id, change_qty, reason, ref_order_id, created_at) FROM stdin;
1	1	-2.0000	product_recipe	29	2026-01-25 23:09:58.348603
2	2	-2.0000	product_recipe	29	2026-01-25 23:09:58.348603
3	1	-1.0000	product_recipe	30	2026-01-25 23:26:05.056343
4	2	-1.0000	product_recipe	30	2026-01-25 23:26:05.056343
5	2	-6.0000	addon_recipe	30	2026-01-25 23:26:05.056343
6	2	-6.0000	addon_recipe	30	2026-01-25 23:26:05.056343
7	2	-6.0000	addon_recipe	30	2026-01-25 23:26:05.056343
8	2	-6.0000	addon_recipe	30	2026-01-25 23:26:05.056343
9	1	-1.0000	product_recipe	31	2026-01-26 00:42:41.240957
10	2	-1.0000	product_recipe	31	2026-01-26 00:42:41.240957
11	3	-30.0000	addon_recipe	31	2026-01-26 00:42:41.240957
12	4	-20.0000	addon_recipe	31	2026-01-26 00:42:41.240957
13	1	-1.0000	product_recipe	32	2026-01-26 00:44:07.577082
14	2	-1.0000	product_recipe	32	2026-01-26 00:44:07.577082
15	3	-30.0000	addon_recipe	32	2026-01-26 00:44:07.577082
16	4	-20.0000	addon_recipe	32	2026-01-26 00:44:07.577082
17	1	-1.0000	product_recipe	33	2026-01-26 00:44:38.976051
18	2	-1.0000	product_recipe	33	2026-01-26 00:44:38.976051
19	4	-20.0000	addon_recipe	33	2026-01-26 00:44:38.976051
20	5	-1.0000	addon_recipe	33	2026-01-26 00:44:38.976051
21	1	-1.0000	product_recipe	35	2026-01-26 00:45:36.080484
22	2	-1.0000	product_recipe	35	2026-01-26 00:45:36.080484
23	4	-20.0000	addon_recipe	35	2026-01-26 00:45:36.080484
24	5	-1.0000	addon_recipe	35	2026-01-26 00:45:36.080484
25	1	-1.0000	product_recipe	36	2026-01-26 00:46:56.522582
26	2	-1.0000	product_recipe	36	2026-01-26 00:46:56.522582
27	4	-20.0000	addon_recipe	36	2026-01-26 00:46:56.522582
28	5	-1.0000	addon_recipe	36	2026-01-26 00:46:56.522582
29	1	-1.0000	product_recipe	37	2026-01-26 00:47:23.505157
30	2	-1.0000	product_recipe	37	2026-01-26 00:47:23.505157
31	4	-20.0000	addon_recipe	37	2026-01-26 00:47:23.505157
32	5	-1.0000	addon_recipe	37	2026-01-26 00:47:23.505157
33	1	-1.0000	product_recipe	38	2026-01-26 00:54:35.088719
34	2	-1.0000	product_recipe	38	2026-01-26 00:54:35.088719
35	3	-30.0000	addon_recipe	38	2026-01-26 00:54:35.088719
36	4	-20.0000	addon_recipe	38	2026-01-26 00:54:35.088719
37	1	-1.0000	product_recipe	39	2026-01-26 00:55:33.96662
38	2	-1.0000	product_recipe	39	2026-01-26 00:55:33.96662
39	3	-30.0000	addon_recipe	39	2026-01-26 00:55:33.96662
40	4	-20.0000	addon_recipe	39	2026-01-26 00:55:33.96662
41	1	-1.0000	product_recipe	40	2026-01-26 00:57:17.747244
42	2	-1.0000	product_recipe	40	2026-01-26 00:57:17.747244
43	3	-30.0000	addon_recipe	40	2026-01-26 00:57:17.747244
44	4	-20.0000	addon_recipe	40	2026-01-26 00:57:17.747244
45	1	-1.0000	product_recipe	41	2026-01-26 00:57:53.452097
46	2	-1.0000	product_recipe	41	2026-01-26 00:57:53.452097
47	3	-30.0000	addon_recipe	41	2026-01-26 00:57:53.452097
48	4	-20.0000	addon_recipe	41	2026-01-26 00:57:53.452097
49	1	-1.0000	product_recipe	42	2026-01-26 00:58:17.809987
50	2	-1.0000	product_recipe	42	2026-01-26 00:58:17.809987
51	4	-20.0000	addon_recipe	42	2026-01-26 00:58:17.809987
52	5	-1.0000	addon_recipe	42	2026-01-26 00:58:17.809987
53	1	-1.0000	product_recipe	43	2026-01-26 00:58:41.720897
54	2	-1.0000	product_recipe	43	2026-01-26 00:58:41.720897
55	3	-30.0000	addon_recipe	43	2026-01-26 00:58:41.720897
56	4	-20.0000	addon_recipe	43	2026-01-26 00:58:41.720897
57	1	-1.0000	product_recipe	44	2026-01-26 00:58:54.788131
58	2	-1.0000	product_recipe	44	2026-01-26 00:58:54.788131
59	4	-20.0000	addon_recipe	44	2026-01-26 00:58:54.788131
60	5	-1.0000	addon_recipe	44	2026-01-26 00:58:54.788131
61	1	-1.0000	product_recipe	45	2026-01-26 01:55:47.782379
62	2	-1.0000	product_recipe	45	2026-01-26 01:55:47.782379
63	4	-20.0000	addon_recipe	45	2026-01-26 01:55:47.782379
64	5	-1.0000	addon_recipe	45	2026-01-26 01:55:47.782379
65	1	-1.0000	product_recipe	46	2026-01-26 02:30:49.736423
66	2	-1.0000	product_recipe	46	2026-01-26 02:30:49.736423
67	4	-20.0000	addon_recipe	46	2026-01-26 02:30:49.736423
68	5	-1.0000	addon_recipe	46	2026-01-26 02:30:49.736423
69	1	-1.0000	product_recipe	47	2026-01-26 02:31:25.230904
70	2	-1.0000	product_recipe	47	2026-01-26 02:31:25.230904
71	4	-20.0000	addon_recipe	47	2026-01-26 02:31:25.230904
72	5	-1.0000	addon_recipe	47	2026-01-26 02:31:25.230904
73	1	-1.0000	product_recipe	48	2026-01-26 02:31:40.877624
74	2	-1.0000	product_recipe	48	2026-01-26 02:31:40.877624
75	4	-20.0000	addon_recipe	48	2026-01-26 02:31:40.877624
76	5	-1.0000	addon_recipe	48	2026-01-26 02:31:40.877624
77	1	-2.0000	product_recipe	49	2026-01-26 11:24:25.325924
78	2	-2.0000	product_recipe	49	2026-01-26 11:24:25.325924
79	3	-30.0000	addon_recipe	49	2026-01-26 11:24:25.325924
80	4	-20.0000	addon_recipe	49	2026-01-26 11:24:25.325924
81	1	-2.0000	product_recipe	50	2026-01-26 11:25:46.326415
82	2	-2.0000	product_recipe	50	2026-01-26 11:25:46.326415
83	3	-30.0000	addon_recipe	50	2026-01-26 11:25:46.326415
84	4	-20.0000	addon_recipe	50	2026-01-26 11:25:46.326415
85	1	-1.0000	product_recipe	51	2026-01-26 18:15:54.990284
86	2	-1.0000	product_recipe	51	2026-01-26 18:15:54.990284
87	4	-20.0000	addon_recipe	51	2026-01-26 18:15:54.990284
88	5	-1.0000	addon_recipe	51	2026-01-26 18:15:54.990284
89	1	1.0000	cancel_reversal	51	2026-01-26 18:31:29.693795
90	2	1.0000	cancel_reversal	51	2026-01-26 18:31:29.693795
91	4	20.0000	cancel_reversal	51	2026-01-26 18:31:29.693795
92	5	1.0000	cancel_reversal	51	2026-01-26 18:31:29.693795
93	1	-1.0000	product_recipe	52	2026-01-26 18:41:25.448812
94	2	-1.0000	product_recipe	52	2026-01-26 18:41:25.448812
95	4	-20.0000	addon_recipe	52	2026-01-26 18:41:25.448812
96	5	-1.0000	addon_recipe	52	2026-01-26 18:41:25.448812
97	1	1.0000	cancel_reversal	52	2026-01-26 18:41:43.079605
98	2	1.0000	cancel_reversal	52	2026-01-26 18:41:43.079605
99	4	20.0000	cancel_reversal	52	2026-01-26 18:41:43.079605
100	5	1.0000	cancel_reversal	52	2026-01-26 18:41:43.079605
101	1	-1.0000	product_recipe	53	2026-01-27 13:20:50.30093
102	2	-1.0000	product_recipe	53	2026-01-27 13:20:50.30093
103	4	-20.0000	addon_recipe	53	2026-01-27 13:20:50.30093
104	1	-1.0000	product_recipe	55	2026-01-28 23:12:10.595167
105	2	-1.0000	product_recipe	55	2026-01-28 23:12:10.595167
106	1	-1.0000	product_recipe	56	2026-01-30 18:55:45.493499
107	2	-1.0000	product_recipe	56	2026-01-30 18:55:45.493499
108	4	-20.0000	addon_recipe	56	2026-01-30 18:55:45.493499
109	1	-1.0000	product_recipe	57	2026-01-30 18:55:53.762142
110	2	-1.0000	product_recipe	57	2026-01-30 18:55:53.762142
111	4	-20.0000	addon_recipe	57	2026-01-30 18:55:53.762142
112	1	-1.0000	product_recipe	58	2026-01-30 18:55:55.173911
113	2	-1.0000	product_recipe	58	2026-01-30 18:55:55.173911
114	4	-20.0000	addon_recipe	58	2026-01-30 18:55:55.173911
115	1	-9.0000	product_recipe	59	2026-01-30 18:56:01.82273
116	2	-9.0000	product_recipe	59	2026-01-30 18:56:01.82273
117	4	-20.0000	addon_recipe	59	2026-01-30 18:56:01.82273
118	1	-1.0000	product_recipe	60	2026-01-30 18:56:11.448288
119	2	-1.0000	product_recipe	60	2026-01-30 18:56:11.448288
120	4	-20.0000	addon_recipe	60	2026-01-30 18:56:11.448288
121	1	-10.0000	product_recipe	62	2026-01-30 18:57:05.545421
122	2	-10.0000	product_recipe	62	2026-01-30 18:57:05.545421
123	4	-20.0000	addon_recipe	62	2026-01-30 18:57:05.545421
124	1	-10.0000	product_recipe	63	2026-01-30 18:57:08.055398
125	2	-10.0000	product_recipe	63	2026-01-30 18:57:08.055398
126	4	-20.0000	addon_recipe	63	2026-01-30 18:57:08.055398
127	1	-10.0000	product_recipe	64	2026-01-30 18:57:11.449486
128	2	-10.0000	product_recipe	64	2026-01-30 18:57:11.449486
129	4	-20.0000	addon_recipe	64	2026-01-30 18:57:11.449486
130	7	900.0000	restock	\N	2026-01-31 00:54:01.508868
131	7	900.0000	restock	\N	2026-01-31 00:54:14.539769
132	7	9000.0000	restock	\N	2026-01-31 00:54:28.171263
133	2	900.0000	stock_in	\N	2026-01-31 18:56:20.699213
134	5	1000.0000	stock_in	\N	2026-01-31 18:56:45.354543
135	7	100.0000	stock_in	\N	2026-01-31 18:57:26.410606
136	8	1000.0000	stock_in	\N	2026-01-31 18:57:56.562771
137	8	1000.0000	stock_in	\N	2026-01-31 18:58:02.549974
138	9	1000.0000	stock_in	\N	2026-01-31 18:58:13.286128
139	10	1000.0000	stock_in	\N	2026-01-31 18:58:17.817439
140	11	1000.0000	stock_in	\N	2026-01-31 18:58:26.469236
141	12	1000.0000	stock_in	\N	2026-01-31 18:58:57.295301
142	13	1000.0000	stock_in	\N	2026-01-31 18:59:19.691569
143	14	1000.0000	stock_in	\N	2026-01-31 18:59:25.592991
144	15	1000.0000	stock_in	\N	2026-01-31 18:59:33.212554
145	16	1000.0000	stock_in	\N	2026-01-31 18:59:37.337776
146	17	1000.0000	stock_in	\N	2026-01-31 18:59:51.089554
147	18	1000.0000	stock_in	\N	2026-01-31 18:59:56.495402
148	19	1000.0000	stock_in	\N	2026-01-31 19:00:26.669208
149	20	1000.0000	stock_in	\N	2026-01-31 19:00:33.384882
150	21	1000.0000	stock_in	\N	2026-01-31 19:00:41.218595
151	22	1000.0000	stock_in	\N	2026-01-31 19:00:44.790732
152	23	1000.0000	stock_in	\N	2026-01-31 19:00:48.699484
153	9	-1.0000	packaging_cup	75	2026-02-01 00:58:27.750296
154	2	-1.0000	packaging_straw	75	2026-02-01 00:58:27.750296
155	7	-200.0000	product_recipe	75	2026-02-01 00:58:27.750296
156	19	-60.0000	product_recipe	75	2026-02-01 00:58:27.750296
157	20	-100.0000	product_recipe	75	2026-02-01 00:58:27.750296
158	8	-20.0000	product_recipe	75	2026-02-01 00:58:27.750296
159	4	-20.0000	addon_recipe	75	2026-02-01 00:58:27.750296
160	9	-1.0000	packaging_cup	76	2026-02-01 00:58:49.259876
161	2	-1.0000	packaging_straw	76	2026-02-01 00:58:49.259876
162	7	-200.0000	product_recipe	76	2026-02-01 00:58:49.259876
163	19	-60.0000	product_recipe	76	2026-02-01 00:58:49.259876
164	20	-100.0000	product_recipe	76	2026-02-01 00:58:49.259876
165	8	-20.0000	product_recipe	76	2026-02-01 00:58:49.259876
166	4	-20.0000	addon_recipe	76	2026-02-01 00:58:49.259876
167	9	-1.0000	packaging_cup	77	2026-02-01 00:58:55.513063
168	2	-1.0000	packaging_straw	77	2026-02-01 00:58:55.513063
169	7	-200.0000	product_recipe	77	2026-02-01 00:58:55.513063
170	19	-60.0000	product_recipe	77	2026-02-01 00:58:55.513063
171	20	-100.0000	product_recipe	77	2026-02-01 00:58:55.513063
172	8	-20.0000	product_recipe	77	2026-02-01 00:58:55.513063
173	4	-20.0000	addon_recipe	77	2026-02-01 00:58:55.513063
174	9	-1.0000	packaging_cup	78	2026-02-01 00:58:59.15822
175	2	-1.0000	packaging_straw	78	2026-02-01 00:58:59.15822
176	7	-200.0000	product_recipe	78	2026-02-01 00:58:59.15822
177	19	-60.0000	product_recipe	78	2026-02-01 00:58:59.15822
178	20	-100.0000	product_recipe	78	2026-02-01 00:58:59.15822
179	8	-20.0000	product_recipe	78	2026-02-01 00:58:59.15822
180	4	-20.0000	addon_recipe	78	2026-02-01 00:58:59.15822
181	9	-1.0000	packaging_cup	79	2026-02-01 00:59:08.171326
182	2	-1.0000	packaging_straw	79	2026-02-01 00:59:08.171326
183	7	-200.0000	product_recipe	79	2026-02-01 00:59:08.171326
184	19	-60.0000	product_recipe	79	2026-02-01 00:59:08.171326
185	20	-100.0000	product_recipe	79	2026-02-01 00:59:08.171326
186	8	-20.0000	product_recipe	79	2026-02-01 00:59:08.171326
187	4	-20.0000	addon_recipe	79	2026-02-01 00:59:08.171326
188	9	-1.0000	packaging_cup	80	2026-02-01 01:00:25.336276
189	2	-1.0000	packaging_straw	80	2026-02-01 01:00:25.336276
190	7	-200.0000	product_recipe	80	2026-02-01 01:00:25.336276
191	19	-60.0000	product_recipe	80	2026-02-01 01:00:25.336276
192	20	-100.0000	product_recipe	80	2026-02-01 01:00:25.336276
193	8	-20.0000	product_recipe	80	2026-02-01 01:00:25.336276
194	4	-20.0000	addon_recipe	80	2026-02-01 01:00:25.336276
195	9	-1.0000	packaging_cup	81	2026-02-01 01:01:18.354782
196	2	-1.0000	packaging_straw	81	2026-02-01 01:01:18.354782
197	7	-200.0000	product_recipe	81	2026-02-01 01:01:18.354782
198	19	-60.0000	product_recipe	81	2026-02-01 01:01:18.354782
199	20	-100.0000	product_recipe	81	2026-02-01 01:01:18.354782
200	8	-20.0000	product_recipe	81	2026-02-01 01:01:18.354782
201	4	-20.0000	addon_recipe	81	2026-02-01 01:01:18.354782
202	9	-1.0000	packaging_cup	82	2026-02-01 01:01:33.452588
203	2	-1.0000	packaging_straw	82	2026-02-01 01:01:33.452588
204	7	-200.0000	product_recipe	82	2026-02-01 01:01:33.452588
205	19	-60.0000	product_recipe	82	2026-02-01 01:01:33.452588
206	20	-100.0000	product_recipe	82	2026-02-01 01:01:33.452588
207	8	-20.0000	product_recipe	82	2026-02-01 01:01:33.452588
208	4	-20.0000	addon_recipe	82	2026-02-01 01:01:33.452588
209	9	-1.0000	packaging_cup	83	2026-02-01 01:02:39.334095
210	2	-1.0000	packaging_straw	83	2026-02-01 01:02:39.334095
211	7	-200.0000	product_recipe	83	2026-02-01 01:02:39.334095
212	19	-60.0000	product_recipe	83	2026-02-01 01:02:39.334095
213	20	-100.0000	product_recipe	83	2026-02-01 01:02:39.334095
214	8	-20.0000	product_recipe	83	2026-02-01 01:02:39.334095
215	4	-20.0000	addon_recipe	83	2026-02-01 01:02:39.334095
216	9	-1.0000	packaging_cup	85	2026-02-01 01:27:24.91335
217	2	-1.0000	packaging_straw	85	2026-02-01 01:27:24.91335
218	14	-1.0000	product_recipe	85	2026-02-01 01:27:24.91335
219	7	-200.0000	product_recipe	85	2026-02-01 01:27:24.91335
220	12	-100.0000	product_recipe	85	2026-02-01 01:27:24.91335
221	13	-20.0000	product_recipe	85	2026-02-01 01:27:24.91335
222	4	-20.0000	addon_recipe	85	2026-02-01 01:27:24.91335
223	9	-1.0000	packaging_cup	86	2026-02-01 01:27:34.523697
224	2	-1.0000	packaging_straw	86	2026-02-01 01:27:34.523697
225	14	-1.0000	product_recipe	86	2026-02-01 01:27:34.523697
226	7	-200.0000	product_recipe	86	2026-02-01 01:27:34.523697
227	12	-100.0000	product_recipe	86	2026-02-01 01:27:34.523697
228	13	-20.0000	product_recipe	86	2026-02-01 01:27:34.523697
229	4	-20.0000	addon_recipe	86	2026-02-01 01:27:34.523697
230	9	-1.0000	packaging_cup	87	2026-02-01 01:27:46.239177
231	2	-1.0000	packaging_straw	87	2026-02-01 01:27:46.239177
232	21	-1.0000	product_recipe	87	2026-02-01 01:27:46.239177
233	7	-200.0000	product_recipe	87	2026-02-01 01:27:46.239177
234	8	-30.0000	product_recipe	87	2026-02-01 01:27:46.239177
235	12	-100.0000	product_recipe	87	2026-02-01 01:27:46.239177
236	4	-20.0000	addon_recipe	87	2026-02-01 01:27:46.239177
237	9	-1.0000	packaging_cup	89	2026-02-01 01:44:18.963084
238	2	-1.0000	packaging_straw	89	2026-02-01 01:44:18.963084
239	15	-7.0000	product_recipe	89	2026-02-01 01:44:18.963084
240	7	-200.0000	product_recipe	89	2026-02-01 01:44:18.963084
241	12	-100.0000	product_recipe	89	2026-02-01 01:44:18.963084
242	13	-15.0000	product_recipe	89	2026-02-01 01:44:18.963084
243	4	-20.0000	addon_recipe	89	2026-02-01 01:44:18.963084
244	9	-1.0000	packaging_cup	90	2026-02-01 02:30:42.669538
245	2	-1.0000	packaging_straw	90	2026-02-01 02:30:42.669538
246	15	-7.0000	product_recipe	90	2026-02-01 02:30:42.669538
247	7	-200.0000	product_recipe	90	2026-02-01 02:30:42.669538
248	12	-100.0000	product_recipe	90	2026-02-01 02:30:42.669538
249	13	-15.0000	product_recipe	90	2026-02-01 02:30:42.669538
250	4	-20.0000	addon_recipe	90	2026-02-01 02:30:42.669538
251	9	-1.0000	packaging_cup	91	2026-02-01 02:32:01.257455
252	2	-1.0000	packaging_straw	91	2026-02-01 02:32:01.257455
253	15	-7.0000	product_recipe	91	2026-02-01 02:32:01.257455
254	7	-200.0000	product_recipe	91	2026-02-01 02:32:01.257455
255	12	-100.0000	product_recipe	91	2026-02-01 02:32:01.257455
256	13	-15.0000	product_recipe	91	2026-02-01 02:32:01.257455
257	4	-20.0000	addon_recipe	91	2026-02-01 02:32:01.257455
258	9	-1.0000	packaging_cup	95	2026-02-02 16:09:44.430761
259	2	-1.0000	packaging_straw	95	2026-02-02 16:09:44.430761
260	15	-7.0000	product_recipe	95	2026-02-02 16:09:44.430761
261	7	-200.0000	product_recipe	95	2026-02-02 16:09:44.430761
262	12	-100.0000	product_recipe	95	2026-02-02 16:09:44.430761
263	13	-15.0000	product_recipe	95	2026-02-02 16:09:44.430761
264	9	-1.0000	packaging_cup	96	2026-02-02 22:07:07.699932
265	2	-1.0000	packaging_straw	96	2026-02-02 22:07:07.699932
266	14	-1.0000	product_recipe	96	2026-02-02 22:07:07.699932
267	7	-200.0000	product_recipe	96	2026-02-02 22:07:07.699932
268	12	-100.0000	product_recipe	96	2026-02-02 22:07:07.699932
269	13	-20.0000	product_recipe	96	2026-02-02 22:07:07.699932
270	12	30000.0000	restock	\N	2026-02-04 00:08:24.662346
271	9	-10.0000	packaging_cup	98	2026-02-04 00:08:38.016922
272	2	-10.0000	packaging_straw	98	2026-02-04 00:08:38.016922
273	14	-10.0000	product_recipe	98	2026-02-04 00:08:38.016922
274	7	-2000.0000	product_recipe	98	2026-02-04 00:08:38.016922
275	12	-1000.0000	product_recipe	98	2026-02-04 00:08:38.016922
276	13	-200.0000	product_recipe	98	2026-02-04 00:08:38.016922
277	9	-10.0000	packaging_cup	99	2026-02-04 00:08:42.646006
278	2	-10.0000	packaging_straw	99	2026-02-04 00:08:42.646006
279	14	-10.0000	product_recipe	99	2026-02-04 00:08:42.646006
280	7	-2000.0000	product_recipe	99	2026-02-04 00:08:42.646006
281	12	-1000.0000	product_recipe	99	2026-02-04 00:08:42.646006
282	13	-200.0000	product_recipe	99	2026-02-04 00:08:42.646006
283	9	-10.0000	packaging_cup	100	2026-02-04 00:08:44.999721
284	2	-10.0000	packaging_straw	100	2026-02-04 00:08:44.999721
285	14	-10.0000	product_recipe	100	2026-02-04 00:08:44.999721
286	7	-2000.0000	product_recipe	100	2026-02-04 00:08:44.999721
287	12	-1000.0000	product_recipe	100	2026-02-04 00:08:44.999721
288	13	-200.0000	product_recipe	100	2026-02-04 00:08:44.999721
289	9	-10.0000	packaging_cup	101	2026-02-04 00:08:49.043348
290	2	-10.0000	packaging_straw	101	2026-02-04 00:08:49.043348
291	14	-10.0000	product_recipe	101	2026-02-04 00:08:49.043348
292	7	-2000.0000	product_recipe	101	2026-02-04 00:08:49.043348
293	12	-1000.0000	product_recipe	101	2026-02-04 00:08:49.043348
294	13	-200.0000	product_recipe	101	2026-02-04 00:08:49.043348
295	9	-1.0000	packaging_cup	104	2026-02-08 02:19:46.047647
296	2	-1.0000	packaging_straw	104	2026-02-08 02:19:46.047647
297	7	-200.0000	product_recipe	104	2026-02-08 02:19:46.047647
298	19	-60.0000	product_recipe	104	2026-02-08 02:19:46.047647
299	20	-100.0000	product_recipe	104	2026-02-08 02:19:46.047647
300	8	-20.0000	product_recipe	104	2026-02-08 02:19:46.047647
301	7	90000.0000	restock	\N	2026-02-08 02:21:48.225482
302	20	90000.0000	restock	\N	2026-02-08 02:22:35.501523
303	9	-3.0000	packaging_cup	108	2026-02-08 02:22:43.298075
304	2	-3.0000	packaging_straw	108	2026-02-08 02:22:43.298075
305	7	-600.0000	product_recipe	108	2026-02-08 02:22:43.298075
306	19	-180.0000	product_recipe	108	2026-02-08 02:22:43.298075
307	20	-300.0000	product_recipe	108	2026-02-08 02:22:43.298075
308	8	-60.0000	product_recipe	108	2026-02-08 02:22:43.298075
309	4	7.0000	restock	\N	2026-02-09 22:23:52.6301
\.


--
-- Data for Name: order_item_add_ons; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.order_item_add_ons (id, order_item_id, add_on_id, qty, price_at_time) FROM stdin;
1	21	4	1	10.00
2	21	5	1	20.00
3	22	4	1	10.00
4	22	5	1	20.00
5	26	4	1	10.00
6	26	5	1	20.00
7	27	4	1	10.00
8	27	5	1	20.00
9	28	4	1	10.00
10	28	5	1	20.00
11	29	4	1	10.00
12	29	5	1	20.00
13	30	5	1	20.00
14	30	6	1	20.00
15	31	5	1	20.00
16	31	6	1	20.00
17	32	5	1	20.00
18	32	6	1	20.00
19	33	5	1	20.00
20	33	6	1	20.00
21	34	4	1	10.00
22	34	5	1	20.00
23	35	4	1	10.00
24	35	5	1	20.00
25	36	4	1	10.00
26	36	5	1	20.00
27	37	4	1	10.00
28	37	5	1	20.00
29	38	5	1	20.00
30	38	6	1	20.00
31	39	4	1	10.00
32	39	5	1	20.00
33	40	5	1	20.00
34	40	6	1	20.00
35	41	5	1	20.00
36	41	6	1	20.00
37	42	5	1	20.00
38	42	6	1	20.00
39	43	5	1	20.00
40	43	6	1	20.00
41	44	5	1	20.00
42	44	6	1	20.00
43	45	4	1	10.00
44	45	5	1	20.00
45	46	4	1	10.00
46	46	5	1	20.00
47	47	5	1	20.00
48	47	6	1	20.00
49	48	5	1	20.00
50	48	6	1	20.00
51	49	5	1	20.00
52	51	5	1	20.00
53	52	5	1	20.00
54	53	5	1	20.00
55	54	5	1	20.00
56	55	5	1	20.00
57	56	5	1	20.00
58	57	5	1	20.00
59	58	5	1	20.00
60	66	5	1	20.00
61	67	5	1	20.00
62	68	5	1	20.00
63	69	5	1	20.00
64	70	5	1	20.00
65	71	5	1	20.00
66	72	5	1	20.00
67	73	5	1	20.00
68	74	5	1	20.00
69	76	5	1	20.00
70	77	5	1	20.00
71	78	5	1	20.00
72	80	5	1	20.00
73	81	5	1	20.00
74	82	5	1	20.00
\.


--
-- Data for Name: order_item_addons; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.order_item_addons (id, order_item_id, addon_id, quantity, unit_price) FROM stdin;
\.


--
-- Data for Name: order_item_customizations; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.order_item_customizations (id, order_item_id, size_option_id, sugar_level_id) FROM stdin;
\.


--
-- Data for Name: order_items; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.order_items (id, order_id, product_id, quantity, price, size, sugar_level, size_extra) FROM stdin;
11	11	1	2	99.00	small	100	0.00
12	13	2	2	200.00	small	100	0.00
13	16	3	2	60.00	small	100	0.00
14	17	3	2	60.00	small	100	0.00
15	18	3	1	60.00	small	100	0.00
16	19	4	2	60.00	small	100	0.00
17	20	3	3	60.00	small	100	0.00
18	21	4	2	60.00	small	100	0.00
19	22	3	2	60.00	small	100	0.00
20	23	4	2	60.00	\N	\N	0.00
21	24	4	1	90.00	\N	\N	0.00
22	25	4	9	90.00	\N	\N	0.00
23	26	4	2	60.00	\N	\N	0.00
24	27	4	2	60.00	\N	\N	0.00
25	28	4	2	60.00	\N	\N	0.00
26	29	4	2	100.00	\N	\N	0.00
27	30	4	1	100.00	\N	\N	0.00
28	31	4	1	100.00	\N	\N	0.00
29	32	4	1	100.00	\N	\N	0.00
30	33	4	1	110.00	\N	\N	0.00
31	35	4	1	110.00	\N	\N	0.00
32	36	4	1	110.00	\N	\N	0.00
33	37	4	1	110.00	\N	\N	0.00
34	38	4	1	100.00	\N	\N	0.00
35	39	4	1	100.00	\N	\N	0.00
36	40	4	1	100.00	\N	\N	0.00
37	41	4	1	100.00	\N	\N	0.00
38	42	4	1	110.00	\N	\N	0.00
39	43	4	1	100.00	\N	\N	0.00
40	44	4	1	110.00	\N	\N	0.00
41	45	4	1	110.00	\N	\N	0.00
42	46	4	1	110.00	\N	\N	0.00
43	47	4	1	110.00	\N	\N	0.00
44	48	4	1	110.00	\N	\N	0.00
45	49	3	2	100.00	\N	\N	0.00
46	50	3	2	100.00	\N	\N	0.00
47	51	4	1	110.00	\N	\N	0.00
48	52	4	1	110.00	\N	\N	0.00
49	53	4	1	80.00	\N	\N	0.00
50	55	5	1	60.00	\N	\N	0.00
51	56	5	1	100.00	\N	\N	0.00
52	57	5	1	100.00	\N	\N	0.00
53	58	5	1	100.00	\N	\N	0.00
54	59	5	9	100.00	\N	\N	0.00
55	60	5	1	100.00	\N	\N	0.00
56	62	5	10	100.00	\N	\N	0.00
57	63	5	10	100.00	\N	\N	0.00
58	64	5	10	100.00	\N	\N	0.00
66	75	7	1	80.00	\N	\N	0.00
67	76	7	1	80.00	\N	\N	0.00
68	77	7	1	80.00	\N	\N	0.00
69	78	7	1	80.00	\N	\N	0.00
70	79	7	1	80.00	\N	\N	0.00
71	80	7	1	80.00	\N	\N	0.00
72	81	7	1	80.00	\N	\N	0.00
73	82	7	1	80.00	\N	\N	0.00
74	83	7	1	80.00	\N	\N	0.00
76	85	6	1	80.00	\N	\N	0.00
77	86	6	1	80.00	\N	\N	0.00
78	87	3	1	80.00	\N	\N	0.00
80	89	5	1	80.00	\N	\N	0.00
81	90	5	1	80.00	\N	\N	0.00
82	91	5	1	80.00	\N	\N	0.00
85	95	5	1	60.00	\N	\N	0.00
86	96	6	1	60.00	\N	\N	0.00
88	98	6	10	60.00	\N	\N	0.00
89	99	6	10	60.00	\N	\N	0.00
90	100	6	10	60.00	\N	\N	0.00
91	101	6	10	60.00	\N	\N	0.00
93	104	7	1	60.00	\N	\N	0.00
97	108	7	3	60.00	\N	\N	0.00
\.


--
-- Data for Name: orders; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.orders (id, user_id, order_type, status, total_amount, created_at, subtotal, vat_amount, vat_rate, earned_points, points_synced, points_claim_expires_at, points_claimed_at, points_claimed_user_id, points_claimed_by_staff_id, points_claim_method) FROM stdin;
11	1	kiosk	paid	198.00	2026-01-24 02:30:03.418993	\N	\N	12.00	0	f	\N	\N	\N	\N	\N
13	1	kiosk	paid	400.00	2026-01-25 00:02:24.824556	357.14	42.86	12.00	0	f	\N	\N	\N	\N	\N
16	1	kiosk	paid	120.00	2026-01-25 01:38:08.332608	107.14	12.86	12.00	0	f	\N	\N	\N	\N	\N
17	1	kiosk	paid	120.00	2026-01-25 01:48:42.523686	107.14	12.86	12.00	0	f	\N	\N	\N	\N	\N
18	1	kiosk	paid	60.00	2026-01-25 01:49:52.478995	53.57	6.43	12.00	0	f	\N	\N	\N	\N	\N
19	1	kiosk	paid	120.00	2026-01-25 01:52:42.699471	107.14	12.86	12.00	0	f	\N	\N	\N	\N	\N
20	1	kiosk	paid	180.00	2026-01-25 02:00:52.53153	160.71	19.29	12.00	0	f	\N	\N	\N	\N	\N
21	1	kiosk	paid	120.00	2026-01-25 03:05:21.291753	107.14	12.86	12.00	0	f	\N	\N	\N	\N	\N
22	1	kiosk	paid	120.00	2026-01-25 03:39:37.531992	107.14	12.86	12.00	0	f	\N	\N	\N	\N	\N
23	1	kiosk	paid	120.00	2026-01-25 19:46:14.216193	107.14	12.86	12.00	0	f	\N	\N	\N	\N	\N
24	1	kiosk	paid	90.00	2026-01-25 21:31:41.59847	80.36	9.64	12.00	0	f	\N	\N	\N	\N	\N
26	1	kiosk	paid	120.00	2026-01-25 21:51:58.420153	107.14	12.86	12.00	0	f	\N	\N	\N	\N	\N
27	1	kiosk	paid	120.00	2026-01-25 21:52:00.10166	107.14	12.86	12.00	0	f	\N	\N	\N	\N	\N
28	1	kiosk	paid	120.00	2026-01-25 22:17:40.779176	107.14	12.86	12.00	0	f	\N	\N	\N	\N	\N
29	1	kiosk	paid	200.00	2026-01-25 23:09:58.348603	178.57	21.43	12.00	0	f	\N	\N	\N	\N	\N
30	1	kiosk	paid	100.00	2026-01-25 23:26:05.056343	89.29	10.71	12.00	0	f	\N	\N	\N	\N	\N
31	1	kiosk	paid	100.00	2026-01-26 00:42:41.240957	89.29	10.71	12.00	0	f	\N	\N	\N	\N	\N
32	1	kiosk	paid	100.00	2026-01-26 00:44:07.577082	89.29	10.71	12.00	0	f	\N	\N	\N	\N	\N
33	1	kiosk	paid	110.00	2026-01-26 00:44:38.976051	98.21	11.79	12.00	0	f	\N	\N	\N	\N	\N
35	1	kiosk	paid	110.00	2026-01-26 00:45:36.080484	98.21	11.79	12.00	0	f	\N	\N	\N	\N	\N
36	1	kiosk	paid	110.00	2026-01-26 00:46:56.522582	98.21	11.79	12.00	0	f	\N	\N	\N	\N	\N
37	1	kiosk	paid	110.00	2026-01-26 00:47:23.505157	98.21	11.79	12.00	0	f	\N	\N	\N	\N	\N
38	1	kiosk	paid	100.00	2026-01-26 00:54:35.088719	89.29	10.71	12.00	0	f	\N	\N	\N	\N	\N
39	1	kiosk	paid	100.00	2026-01-26 00:55:33.96662	89.29	10.71	12.00	0	f	\N	\N	\N	\N	\N
40	1	kiosk	paid	100.00	2026-01-26 00:57:17.747244	89.29	10.71	12.00	0	f	\N	\N	\N	\N	\N
41	1	kiosk	paid	100.00	2026-01-26 00:57:53.452097	89.29	10.71	12.00	0	f	\N	\N	\N	\N	\N
42	1	kiosk	paid	110.00	2026-01-26 00:58:17.809987	98.21	11.79	12.00	0	f	\N	\N	\N	\N	\N
43	1	kiosk	paid	100.00	2026-01-26 00:58:41.720897	89.29	10.71	12.00	0	f	\N	\N	\N	\N	\N
44	1	kiosk	paid	110.00	2026-01-26 00:58:54.788131	98.21	11.79	12.00	0	f	\N	\N	\N	\N	\N
45	1	kiosk	paid	110.00	2026-01-26 01:55:47.782379	98.21	11.79	12.00	0	f	\N	\N	\N	\N	\N
46	1	kiosk	paid	110.00	2026-01-26 02:30:49.736423	98.21	11.79	12.00	0	f	\N	\N	\N	\N	\N
47	1	kiosk	paid	110.00	2026-01-26 02:31:25.230904	98.21	11.79	12.00	0	f	\N	\N	\N	\N	\N
48	1	kiosk	paid	110.00	2026-01-26 02:31:40.877624	98.21	11.79	12.00	0	f	\N	\N	\N	\N	\N
49	1	kiosk	paid	200.00	2026-01-26 11:24:25.325924	178.57	21.43	12.00	0	f	\N	\N	\N	\N	\N
50	1	kiosk	paid	200.00	2026-01-26 11:25:46.326415	178.57	21.43	12.00	0	f	\N	\N	\N	\N	\N
51	1	kiosk	cancelled	110.00	2026-01-26 18:15:54.990284	98.21	11.79	12.00	0	f	\N	\N	\N	\N	\N
52	1	kiosk	cancelled	110.00	2026-01-26 18:41:25.448812	98.21	11.79	12.00	0	f	\N	\N	\N	\N	\N
25	1	kiosk	completed	810.00	2026-01-25 21:41:58.934657	723.21	86.79	12.00	0	f	\N	\N	\N	\N	\N
53	1	kiosk	paid	80.00	2026-01-27 13:20:50.30093	71.43	8.57	12.00	0	f	\N	\N	\N	\N	\N
55	1	online	paid	60.00	2026-01-28 23:12:10.595167	53.57	6.43	12.00	0	f	\N	\N	\N	\N	\N
56	1	online	paid	100.00	2026-01-30 18:55:45.493499	89.29	10.71	12.00	0	f	\N	\N	\N	\N	\N
57	1	online	paid	100.00	2026-01-30 18:55:53.762142	89.29	10.71	12.00	0	f	\N	\N	\N	\N	\N
58	1	online	paid	100.00	2026-01-30 18:55:55.173911	89.29	10.71	12.00	0	f	\N	\N	\N	\N	\N
59	1	online	paid	900.00	2026-01-30 18:56:01.82273	803.57	96.43	12.00	0	f	\N	\N	\N	\N	\N
60	1	online	paid	100.00	2026-01-30 18:56:11.448288	89.29	10.71	12.00	0	f	\N	\N	\N	\N	\N
62	1	online	paid	1000.00	2026-01-30 18:57:05.545421	892.86	107.14	12.00	0	f	\N	\N	\N	\N	\N
63	1	online	paid	1000.00	2026-01-30 18:57:08.055398	892.86	107.14	12.00	0	f	\N	\N	\N	\N	\N
64	1	online	paid	1000.00	2026-01-30 18:57:11.449486	892.86	107.14	12.00	0	f	\N	\N	\N	\N	\N
89	1	kiosk	paid	80.00	2026-02-01 01:44:18.963084	71.43	8.57	12.00	0	f	\N	\N	\N	\N	\N
90	1	kiosk	paid	80.00	2026-02-01 02:30:42.669538	71.43	8.57	12.00	0	f	\N	\N	\N	\N	\N
75	1	kiosk	paid	80.00	2026-02-01 00:58:27.750296	71.43	8.57	12.00	0	f	\N	\N	\N	\N	\N
76	1	kiosk	paid	80.00	2026-02-01 00:58:49.259876	71.43	8.57	12.00	0	f	\N	\N	\N	\N	\N
77	1	kiosk	paid	80.00	2026-02-01 00:58:55.513063	71.43	8.57	12.00	0	f	\N	\N	\N	\N	\N
78	1	kiosk	paid	80.00	2026-02-01 00:58:59.15822	71.43	8.57	12.00	0	f	\N	\N	\N	\N	\N
79	1	kiosk	paid	80.00	2026-02-01 00:59:08.171326	71.43	8.57	12.00	0	f	\N	\N	\N	\N	\N
80	1	kiosk	paid	80.00	2026-02-01 01:00:25.336276	71.43	8.57	12.00	0	f	\N	\N	\N	\N	\N
81	1	kiosk	paid	80.00	2026-02-01 01:01:18.354782	71.43	8.57	12.00	0	f	\N	\N	\N	\N	\N
82	1	kiosk	paid	80.00	2026-02-01 01:01:33.452588	71.43	8.57	12.00	0	f	\N	\N	\N	\N	\N
83	1	kiosk	paid	80.00	2026-02-01 01:02:39.334095	71.43	8.57	12.00	0	f	\N	\N	\N	\N	\N
85	1	kiosk	paid	80.00	2026-02-01 01:27:24.91335	71.43	8.57	12.00	0	f	\N	\N	\N	\N	\N
86	1	kiosk	paid	80.00	2026-02-01 01:27:34.523697	71.43	8.57	12.00	0	f	\N	\N	\N	\N	\N
87	1	kiosk	paid	80.00	2026-02-01 01:27:46.239177	71.43	8.57	12.00	0	f	\N	\N	\N	\N	\N
91	1	kiosk	paid	80.00	2026-02-01 02:32:01.257455	71.43	8.57	12.00	0	f	\N	\N	\N	\N	\N
95	6	online	pending	60.00	2026-02-02 16:09:44.430761	53.57	6.43	12.00	0	f	\N	\N	\N	\N	\N
96	6	kiosk	pending	60.00	2026-02-02 22:07:07.699932	53.57	6.43	12.00	0	f	\N	\N	\N	\N	\N
98	7	kiosk	paid	600.00	2026-02-04 00:08:38.016922	535.71	64.29	12.00	0	f	\N	\N	\N	\N	\N
99	7	kiosk	paid	600.00	2026-02-04 00:08:42.646006	535.71	64.29	12.00	0	f	\N	\N	\N	\N	\N
100	7	kiosk	paid	600.00	2026-02-04 00:08:44.999721	535.71	64.29	12.00	0	f	\N	\N	\N	\N	\N
101	7	kiosk	paid	600.00	2026-02-04 00:08:49.043348	535.71	64.29	12.00	0	f	\N	\N	\N	\N	\N
104	\N	kiosk	pending	60.00	2026-02-08 02:19:46.047647	53.57	6.43	12.00	14	f	2026-02-09 02:19:46.049705	\N	\N	\N	\N
108	\N	kiosk	pending	180.00	2026-02-08 02:22:43.298075	160.71	19.29	12.00	42	f	2026-02-09 02:22:43.299009	\N	\N	\N	\N
\.


--
-- Data for Name: password_reset_tokens; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.password_reset_tokens (id, user_id, token_hash, expires_at, used_at, is_used, created_at, attempts) FROM stdin;
1	5	2c129361834da46ec8772315b779aefd8d2b41e1eefb418f79618e390c23f5c8	2026-02-02 01:45:33.227023+08	2026-02-02 01:31:01.597932+08	t	2026-02-02 01:30:33.162936+08	0
3	7	pbkdf2_sha256$120000$b506053e8ed9acc48ac1a3d977849289$4a2093f98818d48605e51c499b42551cbae054af73b9306506fbe8bcb0e640e5	2026-02-02 17:03:15.455654+08	2026-02-02 16:49:51.42038+08	t	2026-02-03 00:48:15.292102+08	0
4	7	pbkdf2_sha256$120000$077c60e48f93cdb3ee49f1674c3808fc$3537c5d06180720566416e2f59df019cf41d58a329d32c3630004531ab125d69	2026-02-02 17:22:14.100404+08	2026-02-02 17:07:51.926082+08	t	2026-02-03 01:07:13.929524+08	0
9	7	pbkdf2_sha256$120000$163b4e95d1e2877b5af8c62ce96b87d8$fd0f3166946cc456452a4c3fa57436a1d2b48d5819e9029731c66805b6e305ff	2026-02-03 23:45:04.499088+08	\N	t	2026-02-03 23:30:04.347433+08	0
10	7	pbkdf2_sha256$120000$3c167026fb0333d795585491a70a75e8$fd07655653d9b17431dc9dbf8791ac83d31749c403208c162569a1a3f90e6709	2026-02-03 23:48:43.791979+08	\N	t	2026-02-03 23:33:43.623154+08	3
11	8	pbkdf2_sha256$120000$d282b5a1aae0fda9541495a31ac304fc$671559db6ddb662a2cadc35d7deab99a8df9fcca0fb0695d8b2a1bb84abb139e	2026-02-06 14:20:52.274385+08	\N	t	2026-02-06 14:05:52.004415+08	0
12	10	pbkdf2_sha256$120000$5279e9e71cf5a2457697d3097356fb47$33c779bdf2f329065d0ed38550b6753c40c343163cae892b26dd94caa79418b5	2026-02-06 23:31:47.543188+08	\N	t	2026-02-06 23:16:47.377205+08	1
13	12	pbkdf2_sha256$120000$a14bbe34ff2a8ff240edb51fbeb546bc$6d3b2716806d525d30100a4ec0e6797c9dfb94a0dfe71d9f878ca294f332e810	2026-02-08 23:06:43.458111+08	\N	t	2026-02-08 22:51:43.13854+08	1
14	8	pbkdf2_sha256$120000$268fa5c40c7960b731437d63dc193ae4$0653606dc496db0455cbdae0141d432dc84bb4b846aa8305cc3e1d1f912fccb5	2026-02-08 23:36:03.981094+08	\N	t	2026-02-08 23:21:03.779658+08	0
15	12	pbkdf2_sha256$120000$728a9b05e2f0d257c945e825b3cede46$86315aad03a68408c3d6073508f5143831d6fbb45c3e5fa500752431dc318997	2026-02-09 01:14:11.186593+08	\N	t	2026-02-09 00:59:10.657805+08	0
16	8	pbkdf2_sha256$120000$af61385ef5792b9476bbf8ce4172a40d$876a33d8fbfa42067cdf578c6e2056c9b7f96af0ecce0389ae113ae231fa93f0	2026-02-09 01:45:21.442392+08	\N	t	2026-02-09 01:30:20.870399+08	0
17	13	pbkdf2_sha256$120000$a2e880ba81d7472b902783dec1609a53$f10b97c2f13f1b9b96906c184bc40f637f272ac66fc277f0853cf75413589615	2026-02-09 22:35:20.322139+08	\N	t	2026-02-09 22:20:20.147619+08	0
\.


--
-- Data for Name: payments; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.payments (id, order_id, method, status, paid_at) FROM stdin;
\.


--
-- Data for Name: product_recipe; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.product_recipe (id, product_id, inventory_master_id, qty_used) FROM stdin;
7	1	1	1.00
8	2	1	1.00
15	1	2	1.00
16	2	2	1.00
17	7	7	200.00
18	7	19	60.00
19	7	20	100.00
20	7	8	20.00
21	6	14	1.00
22	6	7	200.00
23	6	12	100.00
24	6	13	20.00
25	5	15	7.00
26	5	7	200.00
27	5	12	100.00
28	5	13	15.00
33	8	22	7.00
34	8	23	30.00
35	8	7	200.00
36	8	12	100.00
41	3	16	100.00
42	3	17	150.00
43	3	8	30.00
44	3	12	100.00
45	4	21	1.00
46	4	7	200.00
47	4	8	30.00
48	4	12	100.00
\.


--
-- Data for Name: products; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.products (id, category_id, name, price, is_active, points_per_unit, is_available) FROM stdin;
3	1	Buko	60.00	t	14	t
5	1	Strawberry	60.00	t	14	t
6	1	Classic Teo D' Mango	60.00	t	14	t
7	1	Ube	60.00	t	14	t
8	1	Lychee	60.00	t	14	t
1	1	Mango Cup	99.00	f	0	t
2	1	Mango Shake	129.00	f	0	t
4	1	Avocado	60.00	t	14	t
\.


--
-- Data for Name: qr_redemptions; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.qr_redemptions (id, user_id, reward_id, qr_token, is_used, expires_at, created_at) FROM stdin;
\.


--
-- Data for Name: reward_manual_otp; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.reward_manual_otp (id, user_id, otp_hash, expires_at, is_used, used_at, created_at, attempts, attempt_count, last_attempt_at) FROM stdin;
1	6	pbkdf2_sha256$120000$40d36eea38f80ea632771006dea457a8$d8b8802501cdb12a2b5848938213a94e6ffa62f37fb80c1b8946515eb8c3a902	2026-02-02 10:33:39.166666	t	2026-02-02 10:29:41.738063	2026-02-02 18:28:38.796139	0	0	\N
4	6	pbkdf2_sha256$120000$2467584a88f65c59485929d99efc1bce$7fc4f43af31ded3bdff6b1e89d28108582f074c9b64a829da29924f195d32ac7	2026-02-02 14:26:53.064184	f	\N	2026-02-02 22:21:52.709456	0	0	\N
\.


--
-- Data for Name: reward_transactions; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.reward_transactions (id, reward_wallet_id, reward_id, points_change, transaction_type, order_id, created_at) FROM stdin;
6	1	\N	28	EARN	11	2026-01-24 02:30:03.418993
7	1	\N	42	EARN	20	2026-01-25 02:00:52.53153
8	1	\N	28	EARN	21	2026-01-25 03:05:21.291753
9	1	\N	28	EARN	22	2026-01-25 03:39:37.531992
10	1	\N	28	EARN	23	2026-01-25 19:46:14.216193
11	1	\N	14	EARN	24	2026-01-25 21:31:41.59847
12	1	\N	126	EARN	25	2026-01-25 21:41:58.934657
13	1	\N	28	EARN	26	2026-01-25 21:51:58.420153
14	1	\N	28	EARN	27	2026-01-25 21:52:00.10166
15	1	\N	28	EARN	28	2026-01-25 22:17:40.779176
16	1	\N	28	EARN	29	2026-01-25 23:09:58.348603
17	1	\N	14	EARN	30	2026-01-25 23:26:05.056343
18	1	\N	14	EARN	31	2026-01-26 00:42:41.240957
19	1	\N	14	EARN	32	2026-01-26 00:44:07.577082
20	1	\N	14	EARN	33	2026-01-26 00:44:38.976051
21	1	\N	14	EARN	35	2026-01-26 00:45:36.080484
22	1	\N	14	EARN	36	2026-01-26 00:46:56.522582
23	1	\N	14	EARN	37	2026-01-26 00:47:23.505157
24	1	\N	14	EARN	38	2026-01-26 00:54:35.088719
25	1	\N	14	EARN	39	2026-01-26 00:55:33.96662
26	1	\N	14	EARN	40	2026-01-26 00:57:17.747244
27	1	\N	14	EARN	41	2026-01-26 00:57:53.452097
28	1	\N	14	EARN	42	2026-01-26 00:58:17.809987
29	1	\N	14	EARN	43	2026-01-26 00:58:41.720897
30	1	\N	14	EARN	44	2026-01-26 00:58:54.788131
31	1	\N	14	EARN	45	2026-01-26 01:55:47.782379
32	1	\N	14	EARN	46	2026-01-26 02:30:49.736423
33	1	\N	14	EARN	47	2026-01-26 02:31:25.230904
34	1	\N	14	EARN	48	2026-01-26 02:31:40.877624
35	1	\N	28	EARN	49	2026-01-26 11:24:25.325924
36	1	\N	28	EARN	50	2026-01-26 11:25:46.326415
37	1	\N	14	EARN	51	2026-01-26 18:15:54.990284
38	1	\N	-14	EARN	51	2026-01-26 18:31:29.693795
39	1	\N	14	EARN	52	2026-01-26 18:41:25.448812
40	1	\N	-14	EARN	52	2026-01-26 18:41:43.079605
41	1	\N	14	EARN	53	2026-01-27 13:20:50.30093
42	1	\N	14	EARN	55	2026-01-28 23:12:10.595167
43	1	\N	14	EARN	56	2026-01-30 18:55:45.493499
44	1	\N	14	EARN	57	2026-01-30 18:55:53.762142
45	1	\N	14	EARN	58	2026-01-30 18:55:55.173911
46	1	\N	126	EARN	59	2026-01-30 18:56:01.82273
47	1	\N	14	EARN	60	2026-01-30 18:56:11.448288
48	1	\N	140	EARN	62	2026-01-30 18:57:05.545421
49	1	\N	140	EARN	63	2026-01-30 18:57:08.055398
50	1	\N	140	EARN	64	2026-01-30 18:57:11.449486
51	1	\N	14	EARN	75	2026-02-01 00:58:27.750296
52	1	\N	14	EARN	76	2026-02-01 00:58:49.259876
53	1	\N	14	EARN	77	2026-02-01 00:58:55.513063
54	1	\N	14	EARN	78	2026-02-01 00:58:59.15822
55	1	\N	14	EARN	79	2026-02-01 00:59:08.171326
56	1	\N	14	EARN	80	2026-02-01 01:00:25.336276
57	1	\N	14	EARN	81	2026-02-01 01:01:18.354782
58	1	\N	14	EARN	82	2026-02-01 01:01:33.452588
59	1	\N	14	EARN	83	2026-02-01 01:02:39.334095
60	1	\N	14	EARN	85	2026-02-01 01:27:24.91335
61	1	\N	14	EARN	86	2026-02-01 01:27:34.523697
62	1	\N	14	EARN	87	2026-02-01 01:27:46.239177
63	1	\N	14	EARN	89	2026-02-01 01:44:18.963084
64	1	\N	14	EARN	90	2026-02-01 02:30:42.669538
65	1	\N	14	EARN	91	2026-02-01 02:32:01.257455
66	5	\N	14	EARN	95	2026-02-02 16:09:44.430761
67	5	\N	14	EARN	\N	2026-02-02 18:29:41.429632
68	5	\N	14	EARN	96	2026-02-02 22:07:07.699932
69	6	\N	140	EARN	98	2026-02-04 00:08:38.016922
70	6	\N	140	EARN	99	2026-02-04 00:08:42.646006
71	6	\N	140	EARN	100	2026-02-04 00:08:44.999721
72	6	\N	140	EARN	101	2026-02-04 00:08:49.043348
\.


--
-- Data for Name: reward_wallets; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.reward_wallets (id, user_id, total_points) FROM stdin;
1	1	1554
2	3	0
3	4	0
4	5	0
5	6	42
6	7	560
7	8	0
8	9	0
9	10	0
10	11	0
\.


--
-- Data for Name: rewards; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.rewards (id, name, points_required, is_active) FROM stdin;
\.


--
-- Data for Name: roles; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.roles (id, name) FROM stdin;
1	customer
2	staff
3	admin
4	cashier
\.


--
-- Data for Name: size_options; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.size_options (id, name, price_add, is_active) FROM stdin;
1	Small	0.00	t
2	Medium	10.00	t
3	Large	20.00	t
\.


--
-- Data for Name: staff_profiles; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.staff_profiles (user_id, full_name, "position") FROM stdin;
1	Kristala Patron	cashier
2	Kristala Patron	Cashier
12	Admin	admin
13	Kristala Patron	cashier
\.


--
-- Data for Name: stock_movements; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.stock_movements (id, inventory_item_id, change_qty, reason, created_at) FROM stdin;
1	1	-2	sale	2026-01-24 02:30:03.418993
2	2	-2	sale	2026-01-25 00:02:24.824556
3	7	-2	sale	2026-01-25 01:38:08.332608
4	7	-2	sale	2026-01-25 01:48:42.523686
5	7	-1	sale	2026-01-25 01:49:52.478995
6	6	-2	sale	2026-01-25 01:52:42.699471
7	7	-3	sale	2026-01-25 02:00:52.53153
8	6	-2	sale	2026-01-25 03:05:21.291753
9	7	-2	sale	2026-01-25 03:39:37.531992
10	6	-2	sale	2026-01-25 19:46:14.216193
11	6	-1	sale	2026-01-25 21:31:41.59847
12	6	-9	sale	2026-01-25 21:41:58.934657
13	6	-2	sale	2026-01-25 21:51:58.420153
14	6	-2	sale	2026-01-25 21:52:00.10166
15	6	-2	sale	2026-01-25 22:17:40.779176
16	6	-2	sale	2026-01-25 23:09:58.348603
17	6	-1	sale	2026-01-25 23:26:05.056343
18	6	-1	sale	2026-01-26 00:42:41.240957
19	6	-1	sale	2026-01-26 00:44:07.577082
20	6	-1	sale	2026-01-26 00:44:38.976051
21	6	-1	sale	2026-01-26 00:45:36.080484
22	6	-1	sale	2026-01-26 00:46:56.522582
23	6	-1	sale	2026-01-26 00:47:23.505157
24	6	-1	sale	2026-01-26 00:54:35.088719
25	6	-1	sale	2026-01-26 00:55:33.96662
26	6	-1	sale	2026-01-26 00:57:17.747244
27	6	-1	sale	2026-01-26 00:57:53.452097
28	6	-1	sale	2026-01-26 00:58:17.809987
29	6	-1	sale	2026-01-26 00:58:41.720897
30	6	-1	sale	2026-01-26 00:58:54.788131
31	6	-1	sale	2026-01-26 01:55:47.782379
32	6	-1	sale	2026-01-26 02:30:49.736423
33	6	-1	sale	2026-01-26 02:31:25.230904
34	6	-1	sale	2026-01-26 02:31:40.877624
35	7	-2	sale	2026-01-26 11:24:25.325924
36	7	-2	sale	2026-01-26 11:25:46.326415
37	6	-1	sale	2026-01-26 18:15:54.990284
38	6	1	cancel	2026-01-26 18:31:29.693795
39	6	-1	sale	2026-01-26 18:41:25.448812
40	6	1	cancel	2026-01-26 18:41:43.079605
41	6	-1	sale	2026-01-27 13:20:50.30093
42	3	-1	sale	2026-01-28 23:12:10.595167
43	3	-1	sale	2026-01-30 18:55:45.493499
44	3	-1	sale	2026-01-30 18:55:53.762142
45	3	-1	sale	2026-01-30 18:55:55.173911
46	3	-9	sale	2026-01-30 18:56:01.82273
47	3	-1	sale	2026-01-30 18:56:11.448288
48	3	-10	sale	2026-01-30 18:57:05.545421
49	3	-10	sale	2026-01-30 18:57:08.055398
50	3	-10	sale	2026-01-30 18:57:11.449486
\.


--
-- Data for Name: sugar_levels; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.sugar_levels (id, label, is_active) FROM stdin;
1	0%	t
2	25%	t
3	50%	t
4	100%	t
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.users (id, email, password_hash, role_id, is_active, created_at, google_id, oauth_provider, profile_picture) FROM stdin;
2	cashier1@timsrpay.com	pbkdf2_sha256$200000$d363366c34f9c07aa6c0f267498b38a0$fdbec18ef0bb77148b1985938c3cecb02f23c5f4554cbf8c656c41f29cf565f6	4	t	2026-02-01 23:30:45.133091	\N	\N	\N
1	test@timsrpay.com	8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92	1	t	2026-01-23 23:57:37.976353	\N	\N	\N
3	kristalapatron@gmail.com	1cf9e145dfbde413be2b004dc6b5e5ea1d1b410e18bb1289137de0db15a76c24	1	t	2026-02-02 00:12:21.117455	\N	\N	\N
4	kristala@gmail.com	1cf9e145dfbde413be2b004dc6b5e5ea1d1b410e18bb1289137de0db15a76c24	1	t	2026-02-02 00:45:07.374135	\N	\N	\N
5	feli@gmail.com	pbkdf2_sha256$120000$5601cce0ecd8349e414e2552ab1ee104$dd4ae3d5c299b3516990f6bb7dbd7c6578f56e20093534cfda4df4b38d52bfaf	1	t	2026-02-02 01:29:49.162077	\N	\N	\N
6	talapatron@gmail.com	pbkdf2_sha256$120000$e00c8a1464894380ecd2cc7a93437129$0c426bf8a0d956e35dc01418668ac3933088d0d9c573ddc270bec50a693369ea	1	t	2026-02-02 16:05:54.807563	\N	\N	\N
7	pwelalcadoggo@gmail.com	8e12112fa927eca45f8f2cced98130fdab8eef923c7997cea60952e9a7569492	1	t	2026-02-03 00:11:52.821701	\N	\N	\N
9	teodmangolicious@gmail.com	\N	1	t	2026-02-06 22:33:18.651194	117923670370562660052	google	https://lh3.googleusercontent.com/a/ACg8ocJsOpzeha8fbQm2ig4TmJDkImxmXZ5gckeB3uQBWSI6EPWCvA=s96-c
10	phellebingan@gmail.com	2e29eb8358e66eb6bd6f6668efb7e0230eb32163d51bbd771d6db45d8f10d043	1	t	2026-02-06 23:15:58.776554	101447670096879556750	google	https://lh3.googleusercontent.com/a/ACg8ocJ8GyWvrDUyaIsUhbPJU81QxkJrBP0qkbhCYEDDgaA_pYuAww=s96-c
11	bongayelizabeth5@gmail.com	ac1964eb089654e01f7bfb4871e0cd31ea4d2aa6e6e48774b6b9917b1341dbf6	1	t	2026-02-08 19:02:56.296204	\N	\N	\N
12	felrabago@gmail.com	$2b$12$3JKvmMXLTlLHj41Z0jgQKOiPoPy.HedqMYNlyz3HXYXQyEO/aijJi	3	t	2026-02-08 21:17:32.721139	\N	\N	\N
8	felicity.rabago@gmail.com	$2b$12$7zYcUqzKOErNIJVoPF0KZuyjXqYM2xcBTUL7LviOBSJCqhpne.xi2	1	t	2026-02-05 00:05:29.254396	105582640336977384446	google	https://lh3.googleusercontent.com/a/ACg8ocJXcQ3cW5FPIfvQqaRw59IE_bnaPU_6jyO5DZbCJHE0DnnHOP_YsA=s96-c
13	bellabella011b@gmail.com	$2b$12$DG824tEiA6K8BjKfW8PzZOO1PHBt35SURZodSInQWPYrwHHoWABp6	4	t	2026-02-08 21:19:48.766232	\N	\N	\N
\.


--
-- Data for Name: wallet_transactions; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.wallet_transactions (id, wallet_id, order_id, amount, transaction_type, created_at) FROM stdin;
1	1	\N	200.00	TOPUP	2026-01-24 23:45:35.320024
2	1	11	-198.00	PAYMENT	2026-01-24 23:48:04.189226
3	1	\N	400.00	TOPUP	2026-01-26 00:00:44.162176
4	1	31	100.00	PAYMENT	2026-01-26 00:42:41.240957
5	1	32	100.00	PAYMENT	2026-01-26 00:44:07.577082
6	1	33	110.00	PAYMENT	2026-01-26 00:44:38.976051
7	1	\N	1000.00	TOPUP	2026-01-26 00:45:31.22589
8	1	35	110.00	PAYMENT	2026-01-26 00:45:36.080484
9	1	36	110.00	PAYMENT	2026-01-26 00:46:56.522582
10	1	37	110.00	PAYMENT	2026-01-26 00:47:23.505157
11	1	38	100.00	PAYMENT	2026-01-26 00:54:35.088719
12	1	39	100.00	PAYMENT	2026-01-26 00:55:33.96662
13	1	40	100.00	PAYMENT	2026-01-26 00:57:17.747244
14	1	41	100.00	PAYMENT	2026-01-26 00:57:53.452097
15	1	42	110.00	PAYMENT	2026-01-26 00:58:17.809987
16	1	43	100.00	PAYMENT	2026-01-26 00:58:41.720897
17	1	44	110.00	PAYMENT	2026-01-26 00:58:54.788131
18	1	\N	1000.00	TOPUP	2026-01-26 01:55:01.96322
19	1	45	110.00	PAYMENT	2026-01-26 01:55:47.782379
20	1	48	110.00	PAYMENT	2026-01-26 02:31:40.877624
21	1	49	200.00	PAYMENT	2026-01-26 11:24:25.325924
22	\N	50	200.00	CASH	2026-01-26 11:25:46.326415
23	1	\N	400.00	TOPUP	2026-01-26 18:36:49.111711
24	1	52	110.00	PAYMENT	2026-01-26 18:41:25.448812
25	1	52	110.00	REFUND	2026-01-26 18:41:43.079605
26	1	\N	400.00	TOPUP	2026-01-27 01:27:44.156297
27	1	53	80.00	PAYMENT	2026-01-27 13:20:50.30093
28	1	56	100.00	PAYMENT	2026-01-30 18:55:45.493499
29	1	57	100.00	PAYMENT	2026-01-30 18:55:53.762142
30	1	58	100.00	PAYMENT	2026-01-30 18:55:55.173911
31	1	59	900.00	PAYMENT	2026-01-30 18:56:01.82273
32	1	60	100.00	PAYMENT	2026-01-30 18:56:11.448288
33	1	\N	7000.00	TOPUP	2026-01-30 18:56:58.794259
34	1	62	1000.00	PAYMENT	2026-01-30 18:57:05.545421
35	1	63	1000.00	PAYMENT	2026-01-30 18:57:08.055398
36	1	64	1000.00	PAYMENT	2026-01-30 18:57:11.449486
44	1	75	80.00	PAYMENT	2026-02-01 00:58:27.750296
45	1	76	80.00	PAYMENT	2026-02-01 00:58:49.259876
46	1	77	80.00	PAYMENT	2026-02-01 00:58:55.513063
47	1	78	80.00	PAYMENT	2026-02-01 00:58:59.15822
48	1	79	80.00	PAYMENT	2026-02-01 00:59:08.171326
49	1	80	80.00	PAYMENT	2026-02-01 01:00:25.336276
50	1	81	80.00	PAYMENT	2026-02-01 01:01:18.354782
51	1	82	80.00	PAYMENT	2026-02-01 01:01:33.452588
52	1	83	80.00	PAYMENT	2026-02-01 01:02:39.334095
54	1	85	80.00	PAYMENT	2026-02-01 01:27:24.91335
55	1	86	80.00	PAYMENT	2026-02-01 01:27:34.523697
56	1	87	80.00	PAYMENT	2026-02-01 01:27:46.239177
58	1	89	80.00	PAYMENT	2026-02-01 01:44:18.963084
59	1	90	80.00	PAYMENT	2026-02-01 02:30:42.669538
60	1	91	80.00	PAYMENT	2026-02-01 02:32:01.257455
61	1	\N	4000.00	TOPUP	2026-02-02 12:57:35.309876
62	1	\N	4000.00	TOPUP	2026-02-02 13:04:38.203833
63	5	\N	5000.00	TOPUP	2026-02-02 16:07:44.226345
64	6	\N	10000.00	TOPUP	2026-02-04 00:05:26.472395
66	6	98	600.00	PAYMENT	2026-02-04 00:08:38.016922
67	6	99	600.00	PAYMENT	2026-02-04 00:08:42.646006
68	6	100	600.00	PAYMENT	2026-02-04 00:08:44.999721
69	6	101	600.00	PAYMENT	2026-02-04 00:08:49.043348
\.


--
-- Data for Name: wallets; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.wallets (id, user_id, balance, pin_hash) FROM stdin;
5	6	5000.00	pbkdf2_sha256$120000$6b34d9feb8a811d696b951453992913e$a12327d2385642ae59ae9554d0e5be71b93890ad988e973847d3f03ffc415aa4
6	7	7600.00	pbkdf2_sha256$120000$bcd3aaedb863878b84948a2c83e1b106$1ab7b95fc4382cb82c8c29481b54b45e008aaf88de671c117810570af9522f01
8	9	0.00	\N
9	10	0.00	\N
10	11	0.00	\N
7	8	0.00	pbkdf2_sha256$120000$d027401ca823f2b13ffe13d0f800a6da$bc360c66d6305ad3bb11eb0139a9ef11b3535d3198a4ddb4b0f209168cd1d7a6
2	3	0.00	\N
3	4	0.00	\N
4	5	0.00	\N
1	1	10842.00	pbkdf2_sha256$120000$352a74acb01f4eede1fb6fc28e83b9e6$27247e1bdcd4d44ed6741d4f5d3b7cdc96e93db66d4ca3a3cd4a9f5a860afded
\.


--
-- Name: add_on_recipes_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.add_on_recipes_id_seq', 11, true);


--
-- Name: add_ons_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.add_ons_id_seq', 13, true);


--
-- Name: addons_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.addons_id_seq', 4, true);


--
-- Name: announcements_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.announcements_id_seq', 2, true);


--
-- Name: attendance_logs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.attendance_logs_id_seq', 1, true);


--
-- Name: audit_logs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.audit_logs_id_seq', 1, false);


--
-- Name: categories_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.categories_id_seq', 1, true);


--
-- Name: inventory_items_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.inventory_items_id_seq', 8, true);


--
-- Name: inventory_master_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.inventory_master_id_seq', 23, true);


--
-- Name: inventory_master_movements_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.inventory_master_movements_id_seq', 309, true);


--
-- Name: order_item_add_ons_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.order_item_add_ons_id_seq', 74, true);


--
-- Name: order_item_addons_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.order_item_addons_id_seq', 1, false);


--
-- Name: order_item_customizations_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.order_item_customizations_id_seq', 1, false);


--
-- Name: order_items_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.order_items_id_seq', 97, true);


--
-- Name: orders_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.orders_id_seq', 108, true);


--
-- Name: password_reset_tokens_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.password_reset_tokens_id_seq', 17, true);


--
-- Name: payments_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.payments_id_seq', 1, false);


--
-- Name: product_recipe_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.product_recipe_id_seq', 48, true);


--
-- Name: products_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.products_id_seq', 8, true);


--
-- Name: qr_redemptions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.qr_redemptions_id_seq', 1, false);


--
-- Name: reward_manual_otp_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.reward_manual_otp_id_seq', 4, true);


--
-- Name: reward_transactions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.reward_transactions_id_seq', 72, true);


--
-- Name: reward_wallets_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.reward_wallets_id_seq', 10, true);


--
-- Name: rewards_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.rewards_id_seq', 1, false);


--
-- Name: roles_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.roles_id_seq', 4, true);


--
-- Name: size_options_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.size_options_id_seq', 3, true);


--
-- Name: stock_movements_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.stock_movements_id_seq', 50, true);


--
-- Name: sugar_levels_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.sugar_levels_id_seq', 4, true);


--
-- Name: users_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.users_id_seq', 13, true);


--
-- Name: wallet_transactions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.wallet_transactions_id_seq', 70, true);


--
-- Name: wallets_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.wallets_id_seq', 10, true);


--
-- Name: add_on_recipes add_on_recipes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.add_on_recipes
    ADD CONSTRAINT add_on_recipes_pkey PRIMARY KEY (id);


--
-- Name: add_ons add_ons_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.add_ons
    ADD CONSTRAINT add_ons_name_key UNIQUE (name);


--
-- Name: add_ons add_ons_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.add_ons
    ADD CONSTRAINT add_ons_pkey PRIMARY KEY (id);


--
-- Name: addons addons_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.addons
    ADD CONSTRAINT addons_name_key UNIQUE (name);


--
-- Name: addons addons_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.addons
    ADD CONSTRAINT addons_pkey PRIMARY KEY (id);


--
-- Name: alembic_version alembic_version_pkc; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.alembic_version
    ADD CONSTRAINT alembic_version_pkc PRIMARY KEY (version_num);


--
-- Name: announcements announcements_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.announcements
    ADD CONSTRAINT announcements_pkey PRIMARY KEY (id);


--
-- Name: attendance_logs attendance_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.attendance_logs
    ADD CONSTRAINT attendance_logs_pkey PRIMARY KEY (id);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: categories categories_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_pkey PRIMARY KEY (id);


--
-- Name: customer_profiles customer_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.customer_profiles
    ADD CONSTRAINT customer_profiles_pkey PRIMARY KEY (user_id);


--
-- Name: inventory_items inventory_items_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.inventory_items
    ADD CONSTRAINT inventory_items_pkey PRIMARY KEY (id);


--
-- Name: inventory_master_movements inventory_master_movements_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.inventory_master_movements
    ADD CONSTRAINT inventory_master_movements_pkey PRIMARY KEY (id);


--
-- Name: inventory_master inventory_master_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.inventory_master
    ADD CONSTRAINT inventory_master_name_key UNIQUE (name);


--
-- Name: inventory_master inventory_master_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.inventory_master
    ADD CONSTRAINT inventory_master_pkey PRIMARY KEY (id);


--
-- Name: order_item_add_ons order_item_add_ons_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.order_item_add_ons
    ADD CONSTRAINT order_item_add_ons_pkey PRIMARY KEY (id);


--
-- Name: order_item_addons order_item_addons_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.order_item_addons
    ADD CONSTRAINT order_item_addons_pkey PRIMARY KEY (id);


--
-- Name: order_item_customizations order_item_customizations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.order_item_customizations
    ADD CONSTRAINT order_item_customizations_pkey PRIMARY KEY (id);


--
-- Name: order_items order_items_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_pkey PRIMARY KEY (id);


--
-- Name: orders orders_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_pkey PRIMARY KEY (id);


--
-- Name: password_reset_tokens password_reset_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_pkey PRIMARY KEY (id);


--
-- Name: password_reset_tokens password_reset_tokens_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_token_hash_key UNIQUE (token_hash);


--
-- Name: payments payments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_pkey PRIMARY KEY (id);


--
-- Name: product_recipe product_recipe_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.product_recipe
    ADD CONSTRAINT product_recipe_pkey PRIMARY KEY (id);


--
-- Name: product_recipe product_recipe_product_id_inventory_master_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.product_recipe
    ADD CONSTRAINT product_recipe_product_id_inventory_master_id_key UNIQUE (product_id, inventory_master_id);


--
-- Name: products products_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_pkey PRIMARY KEY (id);


--
-- Name: qr_redemptions qr_redemptions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.qr_redemptions
    ADD CONSTRAINT qr_redemptions_pkey PRIMARY KEY (id);


--
-- Name: qr_redemptions qr_redemptions_qr_token_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.qr_redemptions
    ADD CONSTRAINT qr_redemptions_qr_token_key UNIQUE (qr_token);


--
-- Name: reward_manual_otp reward_manual_otp_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reward_manual_otp
    ADD CONSTRAINT reward_manual_otp_pkey PRIMARY KEY (id);


--
-- Name: reward_transactions reward_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reward_transactions
    ADD CONSTRAINT reward_transactions_pkey PRIMARY KEY (id);


--
-- Name: reward_wallets reward_wallets_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reward_wallets
    ADD CONSTRAINT reward_wallets_pkey PRIMARY KEY (id);


--
-- Name: reward_wallets reward_wallets_user_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reward_wallets
    ADD CONSTRAINT reward_wallets_user_id_key UNIQUE (user_id);


--
-- Name: rewards rewards_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.rewards
    ADD CONSTRAINT rewards_pkey PRIMARY KEY (id);


--
-- Name: roles roles_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_name_key UNIQUE (name);


--
-- Name: roles roles_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (id);


--
-- Name: size_options size_options_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.size_options
    ADD CONSTRAINT size_options_name_key UNIQUE (name);


--
-- Name: size_options size_options_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.size_options
    ADD CONSTRAINT size_options_pkey PRIMARY KEY (id);


--
-- Name: staff_profiles staff_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.staff_profiles
    ADD CONSTRAINT staff_profiles_pkey PRIMARY KEY (user_id);


--
-- Name: stock_movements stock_movements_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT stock_movements_pkey PRIMARY KEY (id);


--
-- Name: sugar_levels sugar_levels_label_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sugar_levels
    ADD CONSTRAINT sugar_levels_label_key UNIQUE (label);


--
-- Name: sugar_levels sugar_levels_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sugar_levels
    ADD CONSTRAINT sugar_levels_pkey PRIMARY KEY (id);


--
-- Name: add_on_recipes uq_addon_recipes; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.add_on_recipes
    ADD CONSTRAINT uq_addon_recipes UNIQUE (add_on_id, inventory_master_id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_google_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_google_id_key UNIQUE (google_id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: wallet_transactions wallet_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.wallet_transactions
    ADD CONSTRAINT wallet_transactions_pkey PRIMARY KEY (id);


--
-- Name: wallets wallets_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.wallets
    ADD CONSTRAINT wallets_pkey PRIMARY KEY (id);


--
-- Name: wallets wallets_user_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.wallets
    ADD CONSTRAINT wallets_user_id_key UNIQUE (user_id);


--
-- Name: idx_aor_add_on_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_aor_add_on_id ON public.add_on_recipes USING btree (add_on_id);


--
-- Name: idx_oia_order_item_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_oia_order_item_id ON public.order_item_add_ons USING btree (order_item_id);


--
-- Name: idx_reward_manual_otp_token_used; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_reward_manual_otp_token_used ON public.reward_manual_otp USING btree (is_used);


--
-- Name: idx_reward_manual_otp_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_reward_manual_otp_user_id ON public.reward_manual_otp USING btree (user_id);


--
-- Name: ix_password_reset_tokens_token_hash; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_password_reset_tokens_token_hash ON public.password_reset_tokens USING btree (token_hash);


--
-- Name: ix_password_reset_tokens_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_password_reset_tokens_user_id ON public.password_reset_tokens USING btree (user_id);


--
-- Name: add_on_recipes add_on_recipes_add_on_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.add_on_recipes
    ADD CONSTRAINT add_on_recipes_add_on_id_fkey FOREIGN KEY (add_on_id) REFERENCES public.add_ons(id) ON DELETE CASCADE;


--
-- Name: add_on_recipes add_on_recipes_inventory_master_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.add_on_recipes
    ADD CONSTRAINT add_on_recipes_inventory_master_id_fkey FOREIGN KEY (inventory_master_id) REFERENCES public.inventory_master(id);


--
-- Name: announcements announcements_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.announcements
    ADD CONSTRAINT announcements_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id);


--
-- Name: announcements announcements_updated_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.announcements
    ADD CONSTRAINT announcements_updated_by_user_id_fkey FOREIGN KEY (updated_by_user_id) REFERENCES public.users(id);


--
-- Name: attendance_logs attendance_logs_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.attendance_logs
    ADD CONSTRAINT attendance_logs_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.users(id);


--
-- Name: audit_logs audit_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: customer_profiles customer_profiles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.customer_profiles
    ADD CONSTRAINT customer_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: orders fk_orders_points_user; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT fk_orders_points_user FOREIGN KEY (points_claimed_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: inventory_items inventory_items_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.inventory_items
    ADD CONSTRAINT inventory_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id);


--
-- Name: inventory_master_movements inventory_master_movements_inventory_master_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.inventory_master_movements
    ADD CONSTRAINT inventory_master_movements_inventory_master_id_fkey FOREIGN KEY (inventory_master_id) REFERENCES public.inventory_master(id);


--
-- Name: order_item_add_ons order_item_add_ons_add_on_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.order_item_add_ons
    ADD CONSTRAINT order_item_add_ons_add_on_id_fkey FOREIGN KEY (add_on_id) REFERENCES public.add_ons(id);


--
-- Name: order_item_add_ons order_item_add_ons_order_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.order_item_add_ons
    ADD CONSTRAINT order_item_add_ons_order_item_id_fkey FOREIGN KEY (order_item_id) REFERENCES public.order_items(id) ON DELETE CASCADE;


--
-- Name: order_item_addons order_item_addons_addon_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.order_item_addons
    ADD CONSTRAINT order_item_addons_addon_id_fkey FOREIGN KEY (addon_id) REFERENCES public.addons(id);


--
-- Name: order_item_addons order_item_addons_order_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.order_item_addons
    ADD CONSTRAINT order_item_addons_order_item_id_fkey FOREIGN KEY (order_item_id) REFERENCES public.order_items(id) ON DELETE CASCADE;


--
-- Name: order_item_customizations order_item_customizations_order_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.order_item_customizations
    ADD CONSTRAINT order_item_customizations_order_item_id_fkey FOREIGN KEY (order_item_id) REFERENCES public.order_items(id) ON DELETE CASCADE;


--
-- Name: order_item_customizations order_item_customizations_size_option_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.order_item_customizations
    ADD CONSTRAINT order_item_customizations_size_option_id_fkey FOREIGN KEY (size_option_id) REFERENCES public.size_options(id);


--
-- Name: order_item_customizations order_item_customizations_sugar_level_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.order_item_customizations
    ADD CONSTRAINT order_item_customizations_sugar_level_id_fkey FOREIGN KEY (sugar_level_id) REFERENCES public.sugar_levels(id);


--
-- Name: order_items order_items_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id);


--
-- Name: order_items order_items_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id);


--
-- Name: orders orders_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: password_reset_tokens password_reset_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: payments payments_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id);


--
-- Name: product_recipe product_recipe_inventory_master_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.product_recipe
    ADD CONSTRAINT product_recipe_inventory_master_id_fkey FOREIGN KEY (inventory_master_id) REFERENCES public.inventory_master(id) ON DELETE RESTRICT;


--
-- Name: product_recipe product_recipe_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.product_recipe
    ADD CONSTRAINT product_recipe_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: products products_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id);


--
-- Name: qr_redemptions qr_redemptions_reward_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.qr_redemptions
    ADD CONSTRAINT qr_redemptions_reward_id_fkey FOREIGN KEY (reward_id) REFERENCES public.rewards(id);


--
-- Name: qr_redemptions qr_redemptions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.qr_redemptions
    ADD CONSTRAINT qr_redemptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: reward_manual_otp reward_manual_otp_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reward_manual_otp
    ADD CONSTRAINT reward_manual_otp_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: reward_transactions reward_transactions_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reward_transactions
    ADD CONSTRAINT reward_transactions_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id);


--
-- Name: reward_transactions reward_transactions_reward_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reward_transactions
    ADD CONSTRAINT reward_transactions_reward_id_fkey FOREIGN KEY (reward_id) REFERENCES public.rewards(id);


--
-- Name: reward_transactions reward_transactions_reward_wallet_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reward_transactions
    ADD CONSTRAINT reward_transactions_reward_wallet_id_fkey FOREIGN KEY (reward_wallet_id) REFERENCES public.reward_wallets(id);


--
-- Name: reward_wallets reward_wallets_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reward_wallets
    ADD CONSTRAINT reward_wallets_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: staff_profiles staff_profiles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.staff_profiles
    ADD CONSTRAINT staff_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: stock_movements stock_movements_inventory_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT stock_movements_inventory_item_id_fkey FOREIGN KEY (inventory_item_id) REFERENCES public.inventory_items(id);


--
-- Name: users users_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id);


--
-- Name: wallet_transactions wallet_transactions_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.wallet_transactions
    ADD CONSTRAINT wallet_transactions_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id);


--
-- Name: wallet_transactions wallet_transactions_wallet_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.wallet_transactions
    ADD CONSTRAINT wallet_transactions_wallet_id_fkey FOREIGN KEY (wallet_id) REFERENCES public.wallets(id);


--
-- Name: wallets wallets_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.wallets
    ADD CONSTRAINT wallets_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- PostgreSQL database dump complete
--

\unrestrict dLd0qjx0Rc4mqVvwIQNcZ6BTcTGAB6jtdXJZ0Wc6mTR3FjQhah0zBefdr248cSs

