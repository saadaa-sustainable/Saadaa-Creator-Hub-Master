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
    <div className="onboarding-stage order-status-stage">
      <PageHeader icon={Truck} title="Order Status" knowMore="order-status" />
      <OrderStatusFiltersBar initial={params} options={options} />
      <Suspense
        key={JSON.stringify(params)}
        fallback={<TableSkeleton rows={6} />}
      >
        <OrderStatusBody params={params} />
      </Suspense>
    </div>
  );
}

async function OrderStatusBody({ params }: { params: OrderStatusFilters }) {
  const { rows, kpi } = await fetchOrderStatusData(params);
  const activeBucket: OrderStatusBucket =
    (params.status as OrderStatusBucket) || "all";
  return (
    <>
      <OrderVolumeStrip
        kpi={kpi}
        activeBucket={activeBucket}
        currentParams={params}
      />
      <CommerceIntelStrip kpi={kpi} />
      <OrderStatusBoard rows={rows} filters={params} />
    </>
  );
}
