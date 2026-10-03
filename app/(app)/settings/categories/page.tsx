import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { Categories } from "@/components/categories/categories";
import { getCategories } from "@/lib/data";

export const metadata = { title: "Categories" };

export default async function CategoriesPage() {
  const categories = await getCategories({ includeArchived: true });
  return (
    <div className="space-y-5">
      <header>
        <Link href="/settings" className="text-muted hover:text-fg inline-flex items-center gap-1 text-sm">
          <ChevronLeft className="size-4" /> Settings
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight md:text-3xl">Categories</h1>
      </header>
      <Categories categories={categories} />
    </div>
  );
}
