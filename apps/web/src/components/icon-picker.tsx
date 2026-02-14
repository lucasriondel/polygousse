import { X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface IconPickerProps {
	icon: string | null;
	fallback: string;
	onChange: (icon: string | null) => void;
}

function extractFirstEmoji(text: string): string | null {
	const match = text.match(/\p{Emoji_Presentation}|\p{Emoji}\uFE0F/u);
	return match ? match[0] : null;
}

export function IconPicker({ icon, fallback, onChange }: IconPickerProps) {
	const [open, setOpen] = useState(false);
	const [inputValue, setInputValue] = useState("");

	const displayChar = icon || (fallback ? fallback.charAt(0).toUpperCase() : "?");

	function handleInputChange(value: string) {
		setInputValue(value);
		const emoji = extractFirstEmoji(value);
		if (emoji) {
			onChange(emoji);
			setInputValue("");
			setOpen(false);
		}
	}

	function handleRemove() {
		onChange(null);
		setInputValue("");
		setOpen(false);
	}

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<button
					type="button"
					className="flex size-9 shrink-0 items-center justify-center rounded-md border bg-muted/50 text-lg hover:bg-muted transition-colors"
				>
					{icon ? (
						<span>{icon}</span>
					) : (
						<span className="text-sm font-semibold text-muted-foreground">{displayChar}</span>
					)}
				</button>
			</PopoverTrigger>
			<PopoverContent className="w-56 p-3" align="start">
				<div className="space-y-2">
					<p className="text-sm font-medium">Pick an emoji</p>
					<Input
						value={inputValue}
						onChange={(e) => handleInputChange(e.target.value)}
						placeholder="Type or paste an emoji"
						autoFocus
					/>
					{icon && (
						<Button type="button" variant="ghost" size="sm" className="w-full" onClick={handleRemove}>
							<X className="mr-1 h-3 w-3" />
							Remove icon
						</Button>
					)}
				</div>
			</PopoverContent>
		</Popover>
	);
}
