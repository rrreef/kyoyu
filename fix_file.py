import sys

def restore():
    with open("/Users/p33/Desktop/XCODE PROJECTS/Kyoyu/Kyoyu/ContentView.swift", "r") as f:
        content = f.read()

    # We will just fix the invalid trackRowView first
    fixed_content = content.replace("private func trackRowView(index: Int, track: NativeTrack) -> some View { index, track in", "private func trackRowView(index: Int, track: NativeTrack) -> some View {")
    
    with open("/Users/p33/Desktop/XCODE PROJECTS/Kyoyu/Kyoyu/ContentView.swift", "w") as f:
        f.write(fixed_content)
    print("Fixed trackRowView!")

restore()
