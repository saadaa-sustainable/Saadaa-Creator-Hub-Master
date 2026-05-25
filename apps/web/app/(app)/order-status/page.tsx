import { Suspense } from "react";
import { Truck } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { TableSkeleton } from "@/components/ui/skeleton";
import { OrderStatusFiltersBar } from "@/features/order-status/filters";
import { OrderStatusBoard } from "@/features/order-status/order-status-board";
import {
  CommerceIntelStrip,
  OrderVolumeStrip,
} from "@/features/order-status/kpi-strips";
import {
  fetchOrderStatusData,
  fetchOrderStatusFilterOptions,
} from "@/features/order-status/queries";
import type {
  OrderStatusBucket,
  OrderStatusFilters,
} from "@/features/order-status/types";

export const metadata = { title: "Order Status" };

export default async function OrderStatusPage({
  searchParams,
}: {
  searchParams: Promise<OrderStatusFilters>;
}) {
  const params = await searchParams;
  const options = await fetchOrderStatusFilterOptions();

  return (
    <div className="onboarding-stage">
      <PageHeader icon={Truck} title="Order Status" knowMore="order-status" />
      <Suspense
        key={JSON.stringify(params)}
        fallback={<TableSkeleton rows={6} />}
      >
        <OrderStatusBody params={params} />
      </Suspense>
      <OrderStatusFiltersBar initial={params} options={options} />
    </div>
  );
}

async function OrderStatusBody({ params }: { params: OrderStatusFilters }) {
  const { rows, kpi } = await fetchOrderStatusData(params);
  const activeBucket: OrderStatusBucket =
    (params.status as OrderStatusBucket) || "all";

  const buildHref = (b: OrderStatusBucket) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v) sp.set(k, String(v));
    }
    if (b === "all") sp.delete("status");
    else sp.set("status", b);
    const q = sp.toString();
    return q ? `/order-status?${q}` : `/order-status`;
  };

  return (
    <>
      <OrderVolumeStrip kpi={kpi} activeBucket={activeBucket} buildHref={buildHref} />
      <CommerceIntelStrip kpi={kpi} />
      <OrderStatusBoard rows={rows} filters={params} />
    </>
  );
}
